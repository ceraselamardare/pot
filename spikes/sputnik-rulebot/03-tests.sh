#!/bin/bash
# Spike 1 (throwaway): the exact test sequence run on 2026-10-21, in order. Labels = files in logs/<label>.json.
# Proposal ids are captured with `addp`, so a re-run against a fresh DAO works (on the existing DAO the ids differ).
# Every tx is signed offline by near-cli-rs 0.30.1 with the legacy-keychain key file and sent via RPC send_tx (see env.sh).
set -u
source "$(dirname "$0")/env.sh"
NEAR001=10000000000000000000000   # 0.01 NEAR in yocto
FT_RECV='{"Transfer":{"token_id":"'$WNEAR'","receiver_id":"'$RECV'","amount":"50000000000000000000000"}}'

# --- a0: bond 0 + DAO with zero free balance -> LackBalanceForState (the DAO pays proposal storage)
tx a0-add-proposal-no-float $RULEBOT $DAO add_proposal '{"proposal":{"description":"spike a0: rulebot NEAR transfer while DAO has zero free balance","kind":{"Transfer":{"token_id":"","receiver_id":"'$RECV'","amount":"'$NEAR001'"}}}}' '0 NEAR' '50 Tgas'
sendnear 03-fund-dao-near $PARENT $DAO '0.3 NEAR'                      # storage float for proposals

# --- a: NEAR transfer, 0 deposit, ONE rulebot vote
A=$(addp a1-add-proposal $RULEBOT '{"proposal":{"description":"spike a: rulebot NEAR transfer","kind":{"Transfer":{"token_id":"","receiver_id":"'$RECV'","amount":"'$NEAR001'"}}}}')
tx a2-act-approve $RULEBOT $DAO act_proposal '{"id":'$A',"action":"VoteApprove"}' '0 NEAR' '100 Tgas'

# --- b: FT path with wNEAR (wrap.testnet)
tx b0-parent-storage $PARENT $WNEAR storage_deposit '{"account_id":"'$PARENT'","registration_only":true}' '0.00125 NEAR' '30 Tgas'
tx b0-near-deposit   $PARENT $WNEAR near_deposit '{}' '0.3 NEAR' '30 Tgas'
tx b0-dao-storage    $PARENT $WNEAR storage_deposit '{"account_id":"'$DAO'","registration_only":true}' '0.00125 NEAR' '30 Tgas'
tx b0-recv-storage   $PARENT $WNEAR storage_deposit '{"account_id":"'$RECV'","registration_only":true}' '0.00125 NEAR' '30 Tgas'
tx b0-ft-to-dao      $PARENT $WNEAR ft_transfer '{"receiver_id":"'$DAO'","amount":"200000000000000000000000","memo":"fund spike DAO"}' '1 yoctoNEAR' '30 Tgas'
B1=$(addp b1-add-proposal $RULEBOT '{"proposal":{"description":"spike b1: rulebot wNEAR transfer to registered recv","kind":'"$FT_RECV"'}}')
tx b1-act-approve $RULEBOT $DAO act_proposal '{"id":'$B1',"action":"VoteApprove"}' '0 NEAR' '100 Tgas'          # -> Approved, recv +0.05 wNEAR
B2=$(addp b2-add-proposal $RULEBOT '{"proposal":{"description":"spike b2: rulebot wNEAR transfer to UNREGISTERED priya","kind":{"Transfer":{"token_id":"'$WNEAR'","receiver_id":"'$PRIYA'","amount":"40000000000000000000000"}}}}')
tx b2-act-approve $RULEBOT $DAO act_proposal '{"id":'$B2',"action":"VoteApprove"}' '0 NEAR' '100 Tgas'          # -> tx OK, proposal Failed
tx b3-rulebot-revote-failed $RULEBOT $DAO act_proposal '{"id":'$B2',"action":"VoteApprove"}' '0 NEAR' '100 Tgas' # ERR_PROPOSAL_NOT_READY_FOR_VOTE
tx b3-rulebot-finalize      $RULEBOT $DAO act_proposal '{"id":'$B2',"action":"Finalize"}' '0 NEAR' '100 Tgas'    # ERR_PERMISSION_DENIED
tx b3-maya-finalize         $MAYA    $DAO act_proposal '{"id":'$B2',"action":"Finalize"}' '0 NEAR' '100 Tgas'    # ERR_PERMISSION_DENIED
tx b4-priya-storage $PARENT $WNEAR storage_deposit '{"account_id":"'$PRIYA'","registration_only":true}' '0.00125 NEAR' '30 Tgas'
ROLE=$(jq -c '.roles[1] | .permissions += ["transfer:Finalize"]' policy.json)                                      # rulebot role + transfer:Finalize
P4=$(addp b4-add-policy-proposal $MAYA "$(jq -nc --argjson r "$ROLE" '{proposal:{description:"spike b4: let rulebot Finalize (retry) failed transfers", kind:{ChangePolicyAddOrUpdateRole:{role:$r}}}}')")
tx b4-maya-approve $MAYA $DAO act_proposal "$(jq -nc --argjson id $P4 --argjson r "$ROLE" '{id:$id, action:"VoteApprove", proposal:{ChangePolicyAddOrUpdateRole:{role:$r}}, memo:"maya approves (with proposal kind arg - v3.2 style)"}')" '0 NEAR' '100 Tgas'  # extra `proposal` arg is ignored by v3.31
tx b4-leo-approve  $LEO  $DAO act_proposal '{"id":'$P4',"action":"VoteApprove"}' '0 NEAR' '100 Tgas'          # 2 of 3 -> policy updated
tx b5-rulebot-finalize-retry $RULEBOT $DAO act_proposal '{"id":'$B2',"action":"Finalize"}' '0 NEAR' '100 Tgas'  # Failed -> Approved, priya paid

# --- c: invite join = AddMemberToRole auto-approved by one rulebot vote (v3.2-style `proposal` arg included)
C=$(addp c1-add-proposal $RULEBOT '{"proposal":{"description":"spike c: invite join newbie","kind":{"AddMemberToRole":{"member_id":"'$NEWBIE'","role":"member"}}}}')
tx c2-act-approve $RULEBOT $DAO act_proposal '{"id":'$C',"action":"VoteApprove","proposal":{"AddMemberToRole":{"member_id":"'$NEWBIE'","role":"member"}}}' '0 NEAR' '100 Tgas'

# --- e: MEMBER-created big transfer; maya votes Reject; rulebot alone approves -> executes (caps live in Rulebot code)
tx e0-maya-storage $PARENT $WNEAR storage_deposit '{"account_id":"'$MAYA'","registration_only":true}' '0.00125 NEAR' '30 Tgas'
E=$(addp e1-maya-add $MAYA '{"proposal":{"description":"spike e: MEMBER-created big transfer (over any cap), maya rejects, rulebot alone approves","kind":{"Transfer":{"token_id":"'$WNEAR'","receiver_id":"'$MAYA'","amount":"100000000000000000000000"}}}}')
tx e2-maya-reject     $MAYA    $DAO act_proposal '{"id":'$E',"action":"VoteReject"}'  '0 NEAR' '100 Tgas'
tx e3-rulebot-approve $RULEBOT $DAO act_proposal '{"id":'$E',"action":"VoteApprove"}' '0 NEAR' '100 Tgas'

# --- d/h: member vote path; in-flight threshold moves when members join (4 members -> 6 members: 3 -> 4 approvals)
H=$(addp h1-add $RULEBOT '{"proposal":{"description":"spike d/h: transfer that goes to a member vote (rulebot does not vote)","kind":{"Transfer":{"token_id":"","receiver_id":"'$RECV'","amount":"5000000000000000000000"}}}}')
tx h2-maya-approve $MAYA $DAO act_proposal '{"id":'$H',"action":"VoteApprove"}' '0 NEAR' '100 Tgas'
tx h3-leo-approve  $LEO  $DAO act_proposal '{"id":'$H',"action":"VoteApprove"}' '0 NEAR' '100 Tgas'            # 2/3 needed -> InProgress
for who in $RECV $PARENT; do
  I=$(addp h4-add-member-${who%%.*} $RULEBOT '{"proposal":{"description":"spike h: join '$who'","kind":{"AddMemberToRole":{"member_id":"'$who'","role":"member"}}}}')
  tx h5-approve-member-${who%%.*} $RULEBOT $DAO act_proposal '{"id":'$I',"action":"VoteApprove"}' '0 NEAR' '100 Tgas'
done
tx h6-priya-approve  $PRIYA  $DAO act_proposal '{"id":'$H',"action":"VoteApprove"}' '0 NEAR' '100 Tgas'        # 3 votes, now 4 needed -> InProgress
tx h7-newbie-approve $NEWBIE $DAO act_proposal '{"id":'$H',"action":"VoteApprove"}' '0 NEAR' '40 Tgas'         # 4/4 -> Approved + executed (0.1 NEAR acct cannot prepay 100 Tgas)
D2=$(addp d2-add $RULEBOT '{"proposal":{"description":"spike d2: transfer the group rejects","kind":{"Transfer":{"token_id":"","receiver_id":"'$RECV'","amount":"7000000000000000000000"}}}}')
for v in $MAYA $LEO $PRIYA $NEWBIE; do tx d2-reject-${v%%.*} $v $DAO act_proposal '{"id":'$D2',"action":"VoteReject"}' '0 NEAR' '30 Tgas'; done  # 4/6 -> Rejected

# --- f: 1 yocto with bond 0 -> ERR_MIN_BOND (assert_eq)
tx f-add-with-1yocto $RULEBOT $DAO add_proposal '{"proposal":{"description":"spike f: 1 yocto with bond 0","kind":{"Transfer":{"token_id":"","receiver_id":"'$RECV'","amount":"1000"}}}}' '1 yoctoNEAR' '50 Tgas'

# --- g: rulebot outside its permissions -> ERR_PERMISSION_DENIED
tx g1-rulebot-update-params $RULEBOT $DAO add_proposal '{"proposal":{"description":"spike g1: rulebot tries to change bond","kind":{"ChangePolicyUpdateParameters":{"parameters":{"proposal_bond":"1"}}}}}' '0 NEAR' '50 Tgas'
tx g2-rulebot-changepolicy $RULEBOT $DAO add_proposal "$(jq -nc --argjson p "$(view $DAO get_policy '{}')" '{proposal:{description:"spike g2: rulebot tries full ChangePolicy", kind:{ChangePolicy:{policy:$p}}}}')" '0 NEAR' '50 Tgas'
tx g3-rulebot-functioncall $RULEBOT $DAO add_proposal '{"proposal":{"description":"spike g3: rulebot tries FunctionCall","kind":{"FunctionCall":{"receiver_id":"'$WNEAR'","actions":[{"method_name":"ft_transfer","args":"e30=","deposit":"1","gas":"10000000000000"}]}}}}' '0 NEAR' '50 Tgas'
V=$(addp g4-maya-add-vote $MAYA '{"proposal":{"description":"spike g4: signaling poll (kind Vote)","kind":"Vote"}}')
tx g4-rulebot-approve-nontransfer $RULEBOT $DAO act_proposal '{"id":'$V',"action":"VoteApprove"}' '0 NEAR' '50 Tgas'

# --- i: Transfer with msg (ft_transfer_call) on v3.31 gets a static 10 Tgas -> token panics -> Failed
I2=$(addp i1-add-transfer-with-msg $RULEBOT '{"proposal":{"description":"spike i: Transfer with msg => ft_transfer_call with static 10 Tgas","kind":{"Transfer":{"token_id":"'$WNEAR'","receiver_id":"'$RECV'","amount":"1000000000000000000000","msg":""}}}}')
tx i2-rulebot-approve $RULEBOT $DAO act_proposal '{"id":'$I2',"action":"VoteApprove"}' '0 NEAR' '100 Tgas'

# --- m: minimum prepaid gas (FT auto-approve) and add_proposal with 3 Tgas
M=$(addp m1-add-ft $RULEBOT '{"proposal":{"description":"spike m: min gas for act_proposal (FT)","kind":{"Transfer":{"token_id":"'$WNEAR'","receiver_id":"'$RECV'","amount":"1000000000000000000000"}}}}')
for g in 12 18 22 26; do tx m2-act-${g}tgas $RULEBOT $DAO act_proposal '{"id":'$M',"action":"VoteApprove"}' '0 NEAR' "$g Tgas"; done   # 12/18/22 fail, 26 ok
tx m3-add-3tgas $RULEBOT $DAO add_proposal '{"proposal":{"description":"spike m3: min gas add_proposal","kind":{"Transfer":{"token_id":"","receiver_id":"'$RECV'","amount":"1"}}}}' '0 NEAR' '3 Tgas'

# --- x: expiry (proposal_period shortened to 120 s by a 4/6 member vote, later restored)
X=$(addp x1-add-period-120s $MAYA '{"proposal":{"description":"spike x: shorten proposal_period to 120 s (expiry test)","kind":{"ChangePolicyUpdateParameters":{"parameters":{"proposal_period":"120000000000"}}}}}')
for v in $MAYA $LEO $PRIYA $NEWBIE; do tx x2-approve-${v%%.*} $v $DAO act_proposal '{"id":'$X',"action":"VoteApprove"}' '0 NEAR' '30 Tgas'; done
tx x4-rulebot-finalize-failed-expired $RULEBOT $DAO act_proposal '{"id":'$I2',"action":"Finalize"}' '0 NEAR' '30 Tgas'  # Failed + expired -> Expired
tx x5-maya-vote-expired-poll $MAYA $DAO act_proposal '{"id":'$V',"action":"VoteApprove"}' '0 NEAR' '30 Tgas'           # -> Expired (vote stored)
Y=$(addp x8-add-transfer $RULEBOT '{"proposal":{"description":"spike x8: transfer approved by rulebot only after expiry","kind":{"Transfer":{"token_id":"","receiver_id":"'$RECV'","amount":"3000000000000000000000"}}}}')
# ... wait > 120 s (polled block timestamp) ...
tx x9-rulebot-approve-expired $RULEBOT $DAO act_proposal '{"id":'$Y',"action":"VoteApprove"}' '0 NEAR' '30 Tgas'   # tx OK, status Expired, no payout
tx x10-rulebot-finalize-expired $RULEBOT $DAO act_proposal '{"id":'$Y',"action":"Finalize"}' '0 NEAR' '30 Tgas'   # ERR_PROPOSAL_NOT_IN_PROGRESS
X2=$(addp x11-restore-period $MAYA '{"proposal":{"description":"spike x11: restore proposal_period to 7 days","kind":{"ChangePolicyUpdateParameters":{"parameters":{"proposal_period":"604800000000000"}}}}}')
for v in $MAYA $LEO $PRIYA $NEWBIE; do tx x12-approve-${v%%.*} $v $DAO act_proposal '{"id":'$X2',"action":"VoteApprove"}' '0 NEAR' '30 Tgas'; done

# --- n: NEAR transfer to a non-existent named account -> AccountDoesNotExist, refund to DAO, status Failed
N=$(addp n1-add-near-to-missing $RULEBOT '{"proposal":{"description":"spike n: NEAR transfer to a non-existent named account","kind":{"Transfer":{"token_id":"","receiver_id":"nobody-xyz.'$PARENT'","amount":"4000000000000000000000"}}}}')
tx n2-rulebot-approve $RULEBOT $DAO act_proposal '{"id":'$N',"action":"VoteApprove"}' '0 NEAR' '30 Tgas'

# --- j: EMPTY Group role + quorum 0 + Finalize permission => unvoted proposal executes (then cleaned up)
J=$(addp j1-add-empty-role $MAYA '{"proposal":{"description":"spike j: add an EMPTY role (no members, no permissions)","kind":{"ChangePolicyAddOrUpdateRole":{"role":{"name":"organizers","kind":{"Group":[]},"permissions":[],"vote_policy":{}}}}}}')
for v in $MAYA $LEO $PRIYA $NEWBIE; do tx j2-approve-${v%%.*} $v $DAO act_proposal '{"id":'$J',"action":"VoteApprove"}' '0 NEAR' '30 Tgas'; done
K=$(addp j3-add-unvoted-transfer $MAYA '{"proposal":{"description":"spike j: unvoted member transfer; Finalize with an empty role in policy","kind":{"Transfer":{"token_id":"","receiver_id":"'$RECV'","amount":"4000000000000000000000"}}}}')
tx j4-rulebot-finalize-unvoted $RULEBOT $DAO act_proposal '{"id":'$K',"action":"Finalize"}' '0 NEAR' '30 Tgas'   # -> Approved + paid with 0 votes
Q=$(addp j5-remove-empty-role $MAYA '{"proposal":{"description":"spike j: remove the empty role again","kind":{"ChangePolicyRemoveRole":{"role":"organizers"}}}}')
for v in $MAYA $LEO $PRIYA $NEWBIE; do tx j6-approve-${v%%.*} $v $DAO act_proposal '{"id":'$Q',"action":"VoteApprove"}' '0 NEAR' '30 Tgas'; done

# ===== Spike 1b: DAO on the testnet GLOBAL contract Ea8t... (sputnikdao2@278adc7, mainnet-like API) =====
G1=g1.$PARENT
# near account create-account fund-myself $G1 '0.15 NEAR' autogenerate-new-keypair save-to-legacy-keychain sign-as $PARENT network-config testnet sign-with-legacy-keychain send
txcmd G1-deploy-global $G1 contract deploy $G1 use-global-hash Ea8tHXFSQVszVwGASyzAfLq65DjcRDhkfab4FcPaRpgD \
  with-init-call new json-args "$(cat create-args-g1.json)" prepaid-gas '100 Tgas' attached-deposit '0 NEAR' network-config testnet
KIND='{"Transfer":{"token_id":"","receiver_id":"'$RECV'","amount":"5000000000000000000000","msg":null}}'
tx G1-a-add $RULEBOT $G1 add_proposal '{"proposal":{"description":"spike 1b: rulebot NEAR transfer","kind":'"$KIND"'}}' '0 NEAR' '30 Tgas'     # id 0
tx G1-b-act-no-kind   $RULEBOT $G1 act_proposal '{"id":0,"action":"VoteApprove"}' '0 NEAR' '50 Tgas'                                       # Failed to deserialize input from JSON.
tx G1-c-wrong-kind    $RULEBOT $G1 act_proposal '{"id":0,"action":"VoteApprove","proposal":{"Transfer":{"token_id":"","receiver_id":"'$RECV'","amount":"5000000000000000000001","msg":null}}}' '0 NEAR' '50 Tgas'  # ERR_WRONG_KIND
tx G1-d-unknown-arg   $RULEBOT $G1 act_proposal '{"id":0,"action":"VoteApprove","proposal":'"$KIND"',"skip_execution":true}' '0 NEAR' '50 Tgas'   # Failed to deserialize input from JSON.
tx G1-e-act-ok        $RULEBOT $G1 act_proposal '{"id":0,"action":"VoteApprove","proposal":'"$KIND"'}' '0 NEAR' '50 Tgas'                       # Approved + paid
tx G1-f0-storage $PARENT $WNEAR storage_deposit '{"account_id":"'$G1'","registration_only":true}' '0.00125 NEAR' '30 Tgas'
tx G1-f0-fund    $PARENT $WNEAR ft_transfer '{"receiver_id":"'$G1'","amount":"20000000000000000000000"}' '1 yoctoNEAR' '30 Tgas'
KMSG='{"Transfer":{"token_id":"'$WNEAR'","receiver_id":"'$RECV'","amount":"10000000000000000000000","msg":""}}'
tx G1-f1-add $RULEBOT $G1 add_proposal '{"proposal":{"description":"spike 1b: Transfer with msg (ft_transfer_call) on 278adc7","kind":'"$KMSG"'}}' '0 NEAR' '30 Tgas'  # id 1
tx G1-f2-act $RULEBOT $G1 act_proposal '{"id":1,"action":"VoteApprove","proposal":'"$KMSG"'}' '0 NEAR' '100 Tgas'   # Approved although the receiver refunded (no ft_on_transfer)
# hardened policy (quorum "1", Finalize perms) + TEMP empty role, then the bypass check
P=$(jq -nc --slurpfile p logs/G2-policy-with-empty-role.json '{proposal:{description:"spike 1b: hardened policy (quorum 1, Finalize perms) + TEMP empty role", kind:{ChangePolicy:{policy:$p[0]}}}}')
tx G2-a-add-changepolicy $MAYA $G1 add_proposal "$P" '0 NEAR' '30 Tgas'                                               # id 2
for v in $MAYA $LEO; do tx G2-b-approve-${v%%.*} $v $G1 act_proposal "$(jq -nc --argjson k "$(view $G1 get_proposal '{"id":2}' | jq -c .kind)" '{id:2, action:"VoteApprove", proposal:$k}')" '0 NEAR' '50 Tgas'; done
KT='{"Transfer":{"token_id":"","receiver_id":"'$RECV'","amount":"3000000000000000000000","msg":null}}'
tx G2-c-add-transfer $RULEBOT $G1 add_proposal '{"proposal":{"description":"spike 1b: Finalize-bypass check with quorum 1","kind":'"$KT"'}}' '0 NEAR' '30 Tgas'   # id 3
tx G2-d-rulebot-finalize-unvoted $RULEBOT $G1 act_proposal '{"id":3,"action":"Finalize","proposal":'"$KT"'}' '0 NEAR' '50 Tgas'   # ERR_PROPOSAL_NOT_EXPIRED_OR_FAILED (bypass blocked)
tx G2-e-rulebot-approve          $RULEBOT $G1 act_proposal '{"id":3,"action":"VoteApprove","proposal":'"$KT"'}' '0 NEAR' '50 Tgas' # Approved + paid
tx G2-f-add-remove-role $MAYA $G1 add_proposal '{"proposal":{"description":"spike 1b: remove TEMP empty role","kind":{"ChangePolicyRemoveRole":{"role":"organizers"}}}}' '0 NEAR' '30 Tgas'  # id 4
for v in $MAYA $LEO; do tx G2-g-approve-${v%%.*} $v $G1 act_proposal '{"id":4,"action":"VoteApprove","proposal":{"ChangePolicyRemoveRole":{"role":"organizers"}}}' '0 NEAR' '50 Tgas'; done
