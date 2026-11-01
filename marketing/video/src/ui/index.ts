// Pot UI kit for the video: app-faithful, frame-driven replicas of the real screens. See src/ui/README.md.

// foundation
export { UiTheme, useUi, makeEnv, palette, alpha, type ThemeName, type Palette, type UiEnv } from "./theme";
export { T, SCREEN_TEXT, DISPLAY, SANS } from "./type";
export { formatUsd, formatSigned, keypadDisplay, names, toCents, MINUS, type MoneyStyle } from "./format";
export { copy, CATEGORIES, REASON_WORD, reasonChip, type Category } from "./copy";
export { MAYA, SAM, LEO, CREW, LISBON, STORY, memberColor, type Person } from "./data";
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
export { Chip, Segmented, Tabs, POT_TABS, type PotTab } from "./atoms/Controls";
export { TabBar, type TabName } from "./atoms/TabBar";
export { ActivityFeed, FeedRow, SystemLine, DayHeader, type FeedEntry, type FeedItem, type FeedGroup } from "./atoms/Feed";
export { ApprovalTimeline, RequestCard, timelineRows, type TimelineRow } from "./atoms/Approvals";
export { RefundTable, type RefundRow } from "./atoms/RefundTable";
export { RuleRow, tripRules, type RuleKey } from "./atoms/Rules";
export { ProgressSteps, type StepState } from "./atoms/ProgressSteps";
export { RulesCapsule, SpendResult, type CapsuleState, type SpendResultState } from "./atoms/ResultCards";
export { Appear } from "./atoms/Appear";
export { TapRipple, Caret, TouchDot, pressAt } from "./atoms/Touch";
export { GoogleMark } from "./atoms/GoogleMark";
export { Toast } from "./atoms/Toast";

// screens
export { PotScreen, type PotScreenProps, type WaitingRequest } from "./screens/PotScreen";
export { BalanceHero, PotHeader, DemoBanner, type HeroPress } from "./screens/PotParts";
export { MembersTab, RulesTab, type MemberLine } from "./screens/PotTabs";
export { InviteLanding, type InviteLandingProps } from "./screens/InviteLanding";
export { ChatScreen, LinkPreviewCard, shareText, type ChatMessage, type ChatLink, type ChatScreenProps } from "./screens/ChatScreen";
export { OgCard, OG_W, OG_H } from "./screens/OgCard";
export { PushNotification, LockScreen, LOCK_WALLPAPER, type PushProps, type LockScreenProps } from "./screens/Push";

// sheets
export { Sheet, type SheetProps } from "./sheets/Sheet";
export { SpendSheet, RulePreview, previewPath, type SpendStep, type SpendSheetProps, type PreviewPath } from "./sheets/SpendSheet";
export { ApproveSheet, type ApproveSheetProps, type ApproveState } from "./sheets/ApproveSheet";
export { CloseSheet, ClosedMoment, defaultRefundRows, type CloseSheetProps, type CloseMode } from "./sheets/CloseSheet";
export { AddMoneySheet, type AddMoneySheetProps, type AddSource } from "./sheets/AddMoneySheet";
export { CreatePotSheet, CREATE_EMOJI, type CreatePotSheetProps } from "./sheets/CreatePotSheet";
export { YoureInSheet, type YoureInSheetProps } from "./sheets/YoureInSheet";

// measured breakout rects
export { LAYOUT, inPhone, type Rect } from "./layout";
