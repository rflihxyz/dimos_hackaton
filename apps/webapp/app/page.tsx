import Link from "next/link";

import { UsersList } from "@/components/users-list";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="w-full space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dimos Access</h1>
          <p className="text-muted-foreground">
            Manage who the robot recognises and what they can ask it to do.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/roles">Manage roles</Link>
          </Button>
          <Button asChild>
            <Link href="/users/new">Add person</Link>
          </Button>
        </div>
      </div>

      <UsersList />
    </div>
  );
}
