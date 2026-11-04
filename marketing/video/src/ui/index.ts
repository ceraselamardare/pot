// Pot UI kit for the video: app-faithful, frame-driven replicas of the real screens. See src/ui/README.md.

// foundation
export { UiTheme, useUi, makeEnv, palette, alpha, type ThemeName, type Palette, type UiEnv } from "./theme";
export { T, SCREEN_TEXT, DISPLAY, SANS } from "./type";
export { formatUsd, formatSigned, keypadDisplay, names, toCents, MINUS, type MoneyStyle } from "./format";
export { copy, CATEGORIES, REASON_WORD, reasonChip, reasonTitle, type Category } from "./copy";
export { MAYA, SAM, LEO, GRANDMA, CREW, LISBON, STORY, GETS_BACK, POT_DOLLARS, memberColor, type Person } from "./data";
export { easeStandard, easeEnter, easeExit, clamp01, span, lerp, pop, MS } from "./ease";
export * from "./fixtures";

// phone + standalone
export {
  Phone,
  BareScreen,
  StatusBar,
  CameraIsland,
  HomeIndicator,
  SCREEN_W,
  SCREEN_H,
  SCREEN_RADIUS,
  SCREEN_RECT,
  BEZEL,
  SAFE_TOP,
  SAFE_BOTTOM,
  PHONE_W,
  PHONE_H,
  PHONE_RADIUS,
  PHONE_SHADOW,
  type PhoneProps,
} from "./Phone";
export { UiPiece, CONTENT_W } from "./Standalone";

// atoms
export { Avatar, AvatarStack, EmptySeat, AVATAR, type AvatarSize } from "./atoms/Avatar";
export { CoverTile, COVER_GRADIENTS, coverGradient, type CoverSize } from "./atoms/CoverTile";
export { GoalBar } from "./atoms/GoalBar";
export { Button, type ButtonVariant } from "./atoms/Button";
export { StatusChip, type ChipStatus } from "./atoms/StatusChip";
export { MoneyText, type MoneyVariant } from "./atoms/MoneyText";
export { Keypad, AmountDisplay, KEYS, type KeyName } from "./atoms/Keypad";
export { TypingDots, dotState } from "./atoms/TypingDots";
export { Celebration, PARTICLES } from "./atoms/Celebration";
export { Chip, Segmented, Tabs, POT_TABS, tabIndexOf, type PotTab } from "./atoms/Controls";
export { TabBar, type TabName } from "./atoms/TabBar";
export { ActivityFeed, FeedRow, SystemLine, DayHeader, REASON_ICON, categoryOf, type FeedEntry, type FeedItem, type FeedGroup, type SpendTier } from "./atoms/Feed";
export { CompactRow, LeadAvatar, RowTitle, ReceiptLink } from "./atoms/CompactRow";
export { PotActions, POT_ACTIONS, type PotActionKey } from "./atoms/PotActions";
export { ApprovalTimeline, RequestCard, timelineRows, type TimelineRow } from "./atoms/Approvals";
export { RefundTable, type RefundRow } from "./atoms/RefundTable";
export { RuleRow, potRules, ruleTiers, tripRules, type RuleKey, type RuleLine, type RuleOpts } from "./atoms/Rules";
export { DecisionLine, decisionPath, decisionCopy, type DecisionPath } from "./atoms/Decision";
export { TrustBadge, TrustRow, MyTrustCard, TrustLevelUp, trustWord, type TrustLevel } from "./atoms/Trust";
export { GoalBanner, GoalCard, type GoalState } from "./atoms/Goal";
export { QrCode, QrPlate, type QrKind } from "./atoms/Qr";
export { Toggle } from "./atoms/Toggle";
export { ProgressSteps, type StepState } from "./atoms/ProgressSteps";
export { RulesCapsule, SpendResult, type CapsuleState, type SpendResultState } from "./atoms/ResultCards";
export { Appear } from "./atoms/Appear";
export { TapRipple, Caret, TouchDot, pressAt } from "./atoms/Touch";
export { GoogleMark } from "./atoms/GoogleMark";
export { Toast } from "./atoms/Toast";

// screens
export { PotScreen, type PotScreenProps, type WaitingRequest } from "./screens/PotScreen";
export { BalanceHero, PotHeader, DemoBanner, type HeroPress } from "./screens/PotParts";
export { MembersTab, SettingsTab, RulesTab, SettingsHeader, type MemberLine, type SettingsTabProps } from "./screens/PotTabs";
export { PayInCard, PayInSheet, SendLinkCard, payInWhat, type PayInTone } from "./screens/Links";
export { InviteLanding, type InviteLandingProps } from "./screens/InviteLanding";
export { ChatScreen, LinkPreviewCard, shareText, type ChatMessage, type ChatLink, type ChatScreenProps } from "./screens/ChatScreen";
export { OgCard, OG_W, OG_H } from "./screens/OgCard";
export { PushNotification, LockScreen, LOCK_WALLPAPER, pushCopy, type PushProps, type PushCopy, type LockScreenProps } from "./screens/Push";

// sheets
export { Sheet, SheetBack, type SheetProps } from "./sheets/Sheet";
export { SpendSheet, RulePreview, previewPath, type SpendStep, type SpendSheetProps, type PreviewPath, type Payee } from "./sheets/SpendSheet";
export { ApproveSheet, OneOkLine, SpendFacts, type ApproveSheetProps, type ApproveState, type ApproveVariant } from "./sheets/ApproveSheet";
export { CloseSheet, ClosedMoment, defaultRefundRows, type CloseSheetProps, type CloseMode } from "./sheets/CloseSheet";
export { AddMoneySheet, type AddMoneySheetProps, type AddSource } from "./sheets/AddMoneySheet";
export {
  CreatePotSheet,
  CreateRuleCard,
  CreateCoverCard,
  CreateSummaryBox,
  AmountField,
  CREATE_EMOJI,
  type CreatePotSheetProps,
  type CreateRuleKind,
} from "./sheets/CreatePotSheet";
export { MoreSheet, AskSheet, MoreItem, type MoreKey, type AskKey } from "./sheets/MenuSheets";
export { YoureInSheet, type YoureInSheetProps } from "./sheets/YoureInSheet";

// measured breakout rects
export { LAYOUT, inPhone, type Rect } from "./layout";
