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
        // mailto is left as-is on purpose; CF only rewrites text nodes in
        // its default config, not the href attribute value.
        href={`mailto:${user}@${domain}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
