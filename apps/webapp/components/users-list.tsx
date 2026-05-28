"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type UserRow } from "@/lib/api";

export function UsersList() {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const reload = () => {
    api.listUsers().then(
      (data) => {
        setError(null);
        setUsers(data);
      },
      (err: Error) => {
        setError(err.message);
        setUsers([]);
      },
    );
  };

  useEffect(() => {
    reload();
    const interval = setInterval(reload, 10_000);
    return () => clearInterval(interval);
  }, []);

  const onDelete = async (username: string) => {
    if (!confirm(`Delete user "${username}"? This also removes their face on file.`)) {
      return;
    }
    setDeleting(username);
    try {
      await api.deleteUser(username);
      toast.success(`Deleted ${username}`);
      reload();
    } catch (e) {
      toast.error(`Delete failed: ${(e as Error).message}`);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-base font-medium">People</CardTitle>
          <CardDescription>
            Faces the robot is allowed to recognise, and what they can ask it to do.
          </CardDescription>
        </div>
        <Button asChild size="sm">
          <Link href="/users/new">Add person</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {users === null && (
          <>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </>
        )}
        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {users !== null && users.length === 0 && !error && (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            No users yet.
            <br />
            <Link href="/users/new" className="text-foreground underline">
              Add the first one
            </Link>
            .
          </div>
        )}
        {users?.map((u) => (
          <UserItem
            key={u.username}
            user={u}
            onDelete={onDelete}
            deleting={deleting === u.username}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function UserItem({
  user,
  onDelete,
  deleting,
}: {
  user: UserRow;
  onDelete: (username: string) => void;
  deleting: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
      <FaceThumb user={user} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{user.full_name}</span>
          <Badge variant="outline" className="font-mono text-xs">
            @{user.username}
          </Badge>
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary" className="text-xs">
            {user.role}
          </Badge>
          {user.has_face_embedding ? (
            <Badge className="bg-emerald-600 hover:bg-emerald-600 text-xs">
              enrolled
            </Badge>
          ) : user.has_face_image ? (
            <Badge variant="secondary" className="text-xs">
              awaiting embedding
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs">
              no face
            </Badge>
          )}
        </div>
      </div>
      <Button
        size="sm"
        variant="destructive"
        onClick={() => onDelete(user.username)}
        disabled={deleting}
      >
        {deleting ? "Deleting…" : "Delete"}
      </Button>
    </div>
  );
}

function FaceThumb({ user }: { user: UserRow }) {
  if (!user.has_face_image) {
    return (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border bg-muted text-xs text-muted-foreground">
        ?
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={api.faceImageUrl(user.username)}
      alt={`${user.full_name}'s face`}
      className="h-12 w-12 shrink-0 rounded-full border object-cover"
    />
  );
}
