export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 text-center">
      <div className="max-w-2xl p-8 rounded-card border border-border bg-card shadow-lg">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl mb-4">
          Growth OS <span className="text-sage italic">SaaS</span>
        </h1>
        <p className="text-muted-foreground text-sm mb-6 leading-relaxed">
          P00 Foundation scaffold active. Turborepo monorepo, Next.js App Router, design tokens, and shared packages established.
        </p>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-sage/30 bg-sage/10 text-sage text-xs font-medium">
          <span className="w-2 h-2 rounded-full bg-sage animate-pulse"></span>
          Status: P00 Foundations Initialized
        </div>
      </div>
    </main>
  );
}

