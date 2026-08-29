// Renders an email with @ as &#64; so Cloudflare Email Obfuscation doesn't
// rewrite it into a /cdn-cgi/l/email-protection link (which 404s on this
// zone). Browsers still render &#64; as @; users can click and select
// normally.

type Props = {
  user: string;
  domain: string;
  href?: boolean;
  className?: string;
};

export function ObfuscatedEmail({ user, domain, href = false, className }: Props) {
  const html = `${user}&#64;${domain}`;
  if (href) {
    return (
      <a
        className={className}
        // %40 keeps CF's email-obfuscation regex from matching the href;
        // browsers URL-decode it back to @ when launching the mail client.
        href={`mailto:${user}%40${domain}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
