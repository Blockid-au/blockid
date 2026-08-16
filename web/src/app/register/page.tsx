/**
 * /register — permanent redirect to /signup.
 *
 * Some marketing/showcase surfaces (e.g. showcase/atlassian/summary) link to
 * `/register` as the sign-up CTA. The actual sign-up surface lives at /signup.
 * This tiny redirect page prevents visible 404s from any inbound link.
 */

import { redirect } from "next/navigation";

export const dynamic = "force-static";

export default function RegisterRedirectPage(): never {
  redirect("/signup");
}
