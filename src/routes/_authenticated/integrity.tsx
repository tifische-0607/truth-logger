import { createFileRoute, Link } from '@tanstack/react-router';
import { ShieldCheck, PackageCheck, CloudDownload } from 'lucide-react';
import { hubHead } from '@/lib/hub';
import { PageHeader } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
export const Route = createFileRoute('/_authenticated/integrity')({ head: () => hubHead('Integrity'), component: IntegrityPage });
function IntegrityPage() { return <><PageHeader title="Integrity" subtitle="Verification and custody" /><div className="flex flex-wrap gap-4"><Button asChild size="lg"><Link to="/verify"><ShieldCheck />Verify</Link></Button><Button asChild variant="outline" size="lg"><Link to="/export"><PackageCheck />Export bundle</Link></Button><Button asChild variant="outline" size="lg"><Link to="/offline"><CloudDownload />Offline library</Link></Button></div></>; }