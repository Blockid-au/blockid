// /workspace/deal-flow — legacy alias.
// Nav shipped `/workspace/deal-flow` while the real page lives at
// `/workspace/investor/dealflow`. Permanent 308 keeps old bookmarks alive.
import { redirect } from "next/navigation";

export default function Page(): never {
  redirect("/workspace/investor/dealflow");
}
