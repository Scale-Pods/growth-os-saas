import { LandingNav } from "@/components/landing/LandingNav";
import { LandingHero } from "@/components/landing/LandingHero";
import { TheSevenStepLoop } from "@/components/landing/TheSevenStepLoop";
import { FeatureCards } from "@/components/landing/FeatureCards";
import { LandingFooter } from "@/components/landing/LandingFooter";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground transition-colors selection:bg-primary/20 selection:text-primary">
      <LandingNav />
      <main className="flex-1">
        <LandingHero />
        <TheSevenStepLoop />
        <FeatureCards />
      </main>
      <LandingFooter />
    </div>
  );
}
