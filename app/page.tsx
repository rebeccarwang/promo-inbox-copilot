import { seedEmails } from "@/lib/seedEmails";
import Inbox from "./Inbox";

export default function Home() {
  return <Inbox emails={seedEmails} />;
}
