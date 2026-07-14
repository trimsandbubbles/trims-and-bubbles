"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type ClientRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  petCount: number;
  appointmentCount: number;
};

export function ClientsTable({ clients }: { clients: ClientRow[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || c.phone?.includes(q));
  }, [clients, query]);

  return (
    <div>
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search clients..." value={query} onChange={(e) => setQuery(e.target.value)} className="pl-8" />
      </div>

      <p className="mt-4 text-xs text-muted-foreground sm:hidden">Swipe sideways to see more →</p>
      <div className="mt-2 overflow-x-auto rounded-xl border border-border sm:mt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Dogs</TableHead>
              <TableHead>Appointments</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <Link href={`/admin/clients/${c.id}`} className="font-medium text-primary underline underline-offset-4">
                    {c.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <div>{c.email}</div>
                  {c.phone && <div>{c.phone}</div>}
                </TableCell>
                <TableCell>{c.petCount}</TableCell>
                <TableCell>{c.appointmentCount}</TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  No clients match &ldquo;{query}&rdquo;.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
