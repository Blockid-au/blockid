// /workspace/cohort — legacy alias.
// Real page: /workspace/accelerator/cohort.
import { redirect } from "next/navigation";

export default function Page(): never {
  redirect("/workspace/accelerator/cohort");
}
