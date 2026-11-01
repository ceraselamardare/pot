// s08 chat content (builder C). The group chat on Maya's phone: the Act 1 money chaos (storyboard s01's lines, as a
// callback, same senders as s01), then Maya's invite (the app's share message + the link preview), then the replies the storyboard asks for.
import type { ChatMessage } from "../../../ui";
import { LEO, MAYA, SAM, shareText } from "../../../ui";

export type ChatAppear = { link: number; sam: number; leo: number; leoTyping?: number };

/** The chat on Maya's phone (she is "me"). `a` drives each new message's 0..1 entrance. */
export const mayaChat = (a: ChatAppear, dotsFrame?: number): ChatMessage[] => {
  const msgs: ChatMessage[] = [
    { id: "h1", from: SAM, text: "who booked the flat??", time: "21:01" },
    { id: "h2", from: LEO, text: "i'll pay you back!!", time: "21:01" },
    { id: "h3", from: SAM, text: "wait how much was the car", time: "21:02" },
    { id: "h4", from: LEO, text: "can someone front the tickets 🙏", time: "21:02" },
    { id: "h5", from: "me", text: "I paid for dinner btw", time: "21:03", read: true },
    { id: "h6", from: SAM, text: "how much do I owe again?", time: "21:03" },
    { id: "h7", from: SAM, text: "who’s holding the trip money?", time: "21:04" },
    {
      id: "invite",
      from: "me",
      kind: "link",
      text: shareText(),
      time: "21:05",
      read: true,
      link: { members: [MAYA, SAM] },
      appear: a.link,
    },
    { id: "sam-in", from: SAM, text: "in!", time: "21:05", appear: a.sam },
  ];
  if ((a.leoTyping ?? 0) > 0 && a.leo <= 0) {
    msgs.push({ id: "leo-typing", from: LEO, kind: "typing", appear: a.leoTyping, dotsFrame });
  } else {
    msgs.push({ id: "leo-now", from: LEO, text: "joining now", time: "21:06", appear: a.leo });
  }
  return msgs;
};
