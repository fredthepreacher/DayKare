import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import { Switch } from '../components/ui/switch';
import { Guidelines } from './parts';

const CORE_SWATCHES = [
  { name: 'Primary · Sunshine', className: 'bg-primary text-primary-foreground' },
  { name: 'Secondary · Playground', className: 'bg-secondary text-secondary-foreground' },
  { name: 'Accent · Imagination', className: 'bg-accent text-accent-foreground' },
] as const;

const SUPPORTING_SWATCHES = [
  { name: 'Paper', className: 'border bg-background' },
  { name: 'Cocoa', className: 'bg-foreground text-background' },
  { name: 'Quiet surface', className: 'bg-muted text-muted-foreground' },
  { name: 'Danger', className: 'bg-destructive text-destructive-foreground' },
  { name: 'Edge', className: 'bg-border text-foreground' },
] as const;

const TYPE_SCALE = [
  { label: 'Display', className: 'font-serif text-5xl font-black leading-none' },
  { label: 'Heading', className: 'font-serif text-3xl font-black leading-tight' },
  { label: 'Body', className: 'text-base font-semibold leading-relaxed' },
  { label: 'Label', className: 'text-sm font-black' },
  { label: 'Eyebrow', className: 'text-xs font-black uppercase tracking-[0.16em] text-muted-foreground' },
] as const;

const SPACING_SCALE = [
  { label: '4', className: 'w-4' },
  { label: '8', className: 'w-8' },
  { label: '12', className: 'w-12' },
  { label: '16', className: 'w-16' },
  { label: '24', className: 'w-24' },
] as const;

function Swatch({ name, className }: { name: string; className: string }) {
  return (
    <div className="space-y-2">
      <div className={`flex h-20 items-end rounded-2xl border p-3 shadow-sm ${className}`}>
        <span className="text-xs font-black">{name}</span>
      </div>
    </div>
  );
}

export function OverviewPage() {
  return (
    <div className="space-y-5">
      <section className="daykare-paper overflow-hidden rounded-[1.75rem] border-[3px] border-sidebar-border p-6 shadow-xl sm:p-8">
        <p className="daykare-pattern-eyebrow">Warm · playful · supervised</p>
        <h2 className="mt-2 max-w-2xl font-serif text-4xl font-black leading-none sm:text-5xl">
          Make every choice feel like a friendly invitation to play.
        </h2>
        <p className="mt-4 max-w-2xl font-semibold leading-relaxed text-muted-foreground">
          DayKare combines storybook warmth with sturdy, unmistakable controls. The system uses
          paper surfaces, cocoa typography, sunny activity colors, and thick tactile edges.
        </p>
        <div className="mt-6 grid grid-cols-3 gap-3">
          {CORE_SWATCHES.map((swatch) => <Swatch key={swatch.name} {...swatch} />)}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.05fr_.95fr]">
        <Card className="daykare-pattern-surface">
          <CardHeader>
            <p className="daykare-pattern-eyebrow">At a glance</p>
            <CardTitle className="font-serif text-3xl font-black">Playground lobby</CardTitle>
            <CardDescription>Core components composed with the extracted tokens.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="daykare-seat-pattern">
              <span className="daykare-seat-avatar-pattern">Y</span>
              <span className="min-w-0">
                <strong className="block">You</strong>
                <small className="text-muted-foreground">Ready to explore</small>
              </span>
              <Badge variant="secondary">Ready</Badge>
            </div>
            <div className="flex items-center justify-between rounded-2xl border bg-muted/70 p-4">
              <span>
                <strong className="block">Reduce motion</strong>
                <small className="text-muted-foreground">Calmer transitions</small>
              </span>
              <Switch aria-label="Reduce motion preview" />
            </div>
          </CardContent>
          <CardFooter className="gap-3">
            <Button className="daykare-tactile daykare-tactile-primary border-0">Story Mode</Button>
            <Button className="daykare-tactile daykare-tactile-secondary border-0">Online preview</Button>
          </CardFooter>
        </Card>

        <section className="rounded-3xl border bg-card p-6 text-card-foreground">
          <p className="daykare-pattern-eyebrow">System principles</p>
          <div className="mt-4">
            <Guidelines items={[
              { kind: 'do', text: 'Lead with one clear action and make its color meaningful.' },
              { kind: 'do', text: 'Use thick edges, generous corners, and at least 44px touch targets.' },
              { kind: 'do', text: 'Keep safety, progress, and offline status explicit in the copy.' },
              { kind: 'dont', text: 'Use color alone to communicate selection, readiness, or danger.' },
              { kind: 'dont', text: 'Hide important choices behind subtle icons or tiny controls.' },
            ]} />
          </div>
        </section>
      </div>
    </div>
  );
}

export function BrandPage() {
  return (
    <div className="grid gap-5 lg:grid-cols-[.9fr_1.1fr]">
      <section className="daykare-paper grid min-h-80 place-items-center rounded-[1.75rem] border-[3px] border-sidebar-border p-6">
        <img
          src={`${import.meta.env.BASE_URL}daykare-references/logos/daykare-playtime-mark.png`}
          alt="DayKare illustrated playtime mark"
          className="max-h-72 w-full object-contain"
        />
      </section>
      <section className="rounded-3xl border bg-card p-6">
        <p className="daykare-pattern-eyebrow">Primary brand asset</p>
        <h2 className="mt-2 font-serif text-3xl font-black">Playtime mark</h2>
        <p className="mt-3 font-semibold leading-relaxed text-muted-foreground">
          The retained raster mark is the source app’s menu image. Use it for welcoming,
          family-facing moments—not as a tiny utility icon or over busy gameplay.
        </p>
        <div className="mt-6">
          <Guidelines items={[
            { kind: 'do', text: 'Give the illustrated mark breathing room on paper or simple color fields.' },
            { kind: 'do', text: 'Keep the full mark intact; its school, sun, toys, and wordmark are one composition.' },
            { kind: 'dont', text: 'Crop, recolor, redraw, or place the mark behind functional controls.' },
          ]} />
        </div>
      </section>
    </div>
  );
}

export function ColorsPage() {
  return (
    <div className="space-y-8 rounded-3xl border bg-card p-6 text-card-foreground">
      <section className="space-y-4">
        <div>
          <p className="daykare-pattern-eyebrow">Core palette</p>
          <h2 className="mt-1 font-serif text-2xl font-black">Activity colors carry meaning</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {CORE_SWATCHES.map((swatch) => <Swatch key={swatch.name} {...swatch} />)}
        </div>
      </section>
      <section className="space-y-4 border-t pt-6">
        <h2 className="font-serif text-2xl font-black">Paper, cocoa, and semantic roles</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {SUPPORTING_SWATCHES.map((swatch) => <Swatch key={swatch.name} {...swatch} />)}
        </div>
      </section>
      <Guidelines items={[
        { kind: 'do', text: 'Use orange for the primary story path, teal for connection and secondary actions, and pink for imaginative customization.' },
        { kind: 'do', text: 'Pair every colored surface with its assigned foreground token.' },
        { kind: 'dont', text: 'Scatter the three core colors without hierarchy; each screen still needs one dominant action.' },
      ]} />
    </div>
  );
}

export function FontsPage() {
  return (
    <div className="space-y-8 rounded-3xl border bg-card p-6 text-card-foreground">
      <section>
        <p className="daykare-pattern-eyebrow">Fraunces · Plus Jakarta Sans · Space Mono</p>
        <p className="mt-4 font-serif text-5xl font-black leading-none">A story starts here.</p>
        <p className="mt-3 max-w-2xl font-semibold leading-relaxed text-muted-foreground">
          Display headings feel bookish and expressive. Interface copy stays sturdy and easy to scan.
          Mono is reserved for compact codes and diagnostic readouts.
        </p>
      </section>
      <section className="space-y-5 border-t pt-6">
        {TYPE_SCALE.map((entry) => (
          <div key={entry.label} className="grid gap-2 sm:grid-cols-[96px_1fr]">
            <span className="pt-1 text-xs font-black uppercase tracking-wide text-muted-foreground">{entry.label}</span>
            <p className={entry.className}>Kind play, clear boundaries.</p>
          </div>
        ))}
      </section>
      <Guidelines items={[
        { kind: 'do', text: 'Use Fraunces for story titles and destination-level headings.' },
        { kind: 'do', text: 'Use Plus Jakarta Sans in controls, descriptions, and data-heavy panels.' },
        { kind: 'dont', text: 'Set long paragraphs in the display face or shrink support copy below a readable mobile size.' },
      ]} />
    </div>
  );
}

export function LayoutPage() {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="rounded-3xl border bg-card p-6 text-card-foreground">
        <p className="daykare-pattern-eyebrow">Four-pixel rhythm</p>
        <h2 className="mt-1 font-serif text-2xl font-black">Spacing</h2>
        <div className="mt-6 space-y-4">
          {SPACING_SCALE.map((space) => (
            <div key={space.label} className="flex items-center gap-4">
              <span className="w-8 font-mono text-xs text-muted-foreground">{space.label}</span>
              <div className={`h-3 rounded-full bg-primary ${space.className}`} />
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-3xl border bg-card p-6 text-card-foreground">
        <p className="daykare-pattern-eyebrow">Soft, substantial edges</p>
        <h2 className="mt-1 font-serif text-2xl font-black">Radius and elevation</h2>
        <div className="mt-6 grid grid-cols-2 gap-4">
          {[
            { label: 'Control', className: 'rounded-lg' },
            { label: 'Card', className: 'rounded-xl' },
            { label: 'Feature', className: 'rounded-2xl' },
            { label: 'Panel', className: 'rounded-3xl shadow-xl' },
          ].map((radius) => (
            <div key={radius.label} className={`flex h-24 items-end border-[3px] bg-muted p-3 ${radius.className}`}>
              <span className="text-xs font-black">{radius.label}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-3xl border bg-card p-6 lg:col-span-2">
        <Guidelines items={[
          { kind: 'do', text: 'Use 12–24px gaps inside cards and 24–36px around major panels.' },
          { kind: 'do', text: 'Reserve the largest radius and shadow for modal or destination-level surfaces.' },
          { kind: 'dont', text: 'Stack heavy shadows on every nested card; let borders carry most grouping.' },
        ]} />
      </section>
    </div>
  );
}