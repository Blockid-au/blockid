// /workspace/advisor-notes — legacy alias.
// Real page: /workspace/advisor/notes.
import { redirect } from "next/navigation";

export default function Page(): never {
  redirect("/workspace/advisor/notes");
}
