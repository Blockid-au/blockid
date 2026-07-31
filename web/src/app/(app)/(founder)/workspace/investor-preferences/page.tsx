// /workspace/investor-preferences — legacy alias.
// Real page: /workspace/investor/preferences.
import { redirect } from "next/navigation";

export default function Page(): never {
  redirect("/workspace/investor/preferences");
}
