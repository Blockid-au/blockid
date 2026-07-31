// /workspace/client-roster — legacy alias.
// Real page: /workspace/advisor/roster.
import { redirect } from "next/navigation";

export default function Page(): never {
  redirect("/workspace/advisor/roster");
}
