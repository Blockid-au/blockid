// /workspace/portfolio — legacy alias.
// Real page: /workspace/investor/portfolio.
import { redirect } from "next/navigation";

export default function Page(): never {
  redirect("/workspace/investor/portfolio");
}
