// /workspace/watchlist — legacy alias.
// Real page: /workspace/investor/watchlist.
import { redirect } from "next/navigation";

export default function Page(): never {
  redirect("/workspace/investor/watchlist");
}
