import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { ListPlus } from 'lucide-react';
import { hubHead } from '@/lib/hub';
import { PageHeader } from '@/components/AppShell';
import { NewCaptureSheet } from '@/components/NewCaptureSheet';
import { Button } from '@/components/ui/button';
export const Route = createFileRoute('/_authenticated/collect')({ head: () => hubHead('Collect now'), component: CollectPage });
function CollectPage() { const [open, setOpen] = useState(false); return <><PageHeader title="Collect" subtitle="New evidence capture" /><Button size="lg" onClick={() => setOpen(true)}><ListPlus />New capture</Button><NewCaptureSheet open={open} onOpenChange={setOpen} /></>; }