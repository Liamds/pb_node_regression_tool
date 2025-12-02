export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  return <div className="min-h-screen bg-background">{children}</div>;
}

