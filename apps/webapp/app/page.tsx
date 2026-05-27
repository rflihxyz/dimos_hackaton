import Link from "next/link";

import { AgentChat } from "@/components/agent-chat";
import { RecipeList } from "@/components/recipe-list";
import { VideoPanel } from "@/components/video-panel";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            Dimos Learned Skills
          </h1>
          <p className="text-xs text-muted-foreground">
            Teach the robot something new in plain English.
          </p>
        </div>
        <Button asChild>
          <Link href="/skills/new">Teach a skill</Link>
        </Button>
      </header>

      <main className="grid flex-1 gap-4 p-4 md:grid-cols-3 md:p-6">
        <section className="md:col-span-2">
          <VideoPanel />
        </section>
        <section className="md:row-span-2 min-h-[420px] md:min-h-0">
          <RecipeList />
        </section>
        <section className="md:col-span-2 min-h-[360px]">
          <AgentChat />
        </section>
      </main>
    </div>
  );
}
