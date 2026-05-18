const logos = [
  "Startmate",
  "Antler",
  "BlueChilli",
  "Stone & Chalk",
  "Cicada",
  "AWS for Startups",
];

export function LogoCloud() {
  return (
    <section
      aria-labelledby="logo-cloud-title"
      className="border-y border-surface-300 bg-surface-100"
    >
      <div className="mx-auto max-w-7xl px-6 py-12">
        <p
          id="logo-cloud-title"
          className="text-center text-xs uppercase tracking-[0.2em] text-slate-400 font-medium"
        >
          Trusted by Australia&apos;s startup ecosystem
        </p>
        <ul className="mt-8 grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3 md:grid-cols-6 items-center">
          {logos.map((name) => (
            <li
              key={name}
              className="text-center text-sm md:text-base font-semibold tracking-tight text-slate-400 opacity-60 transition-opacity duration-200 hover:opacity-100 hover:text-slate-700"
            >
              {name}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
