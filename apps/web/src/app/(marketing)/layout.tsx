/**
 * The landing page's headline font (Satoshi) comes from Fontshare. It is loaded here and not in
 * the root layout, so the app's own pages make no request to a third-party server: they stay
 * private and work offline.
 */
export default function MarketingLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=satoshi@900,700,500,400&display=swap" precedence="default" />
      {children}
    </>
  );
}
