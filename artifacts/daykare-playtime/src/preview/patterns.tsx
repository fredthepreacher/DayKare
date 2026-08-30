import { ArrowRight, Check, Globe2, Sparkles, Users } from 'lucide-react';
import { Badge } from '../components/ui/badge';
import { Guidelines } from './parts';

export function DayKarePatternsPage() {
  return (
    <div className="space-y-6">
      <section className="daykare-pattern-surface daykare-paper p-6 sm:p-8">
        <p className="daykare-pattern-eyebrow">Destination actions</p>
        <h2 className="mt-1 font-serif text-3xl font-black">Big choices feel playful and obvious</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <button type="button" className="daykare-tactile daykare-tactile-primary flex min-h-24 items-center gap-4 p-4 text-left">
            <span className="grid size-14 place-items-center rounded-2xl border-[3px] border-white/40 bg-white/20"><Sparkles /></span>
            <span className="min-w-0 flex-1">
              <strong className="block text-xl">Story Mode</strong>
              <small className="font-bold opacity-80">Continue your DayKare adventure</small>
            </span>
            <ArrowRight />
          </button>
          <button type="button" className="daykare-tactile daykare-tactile-secondary flex min-h-24 items-center gap-4 p-4 text-left">
            <span className="grid size-14 place-items-center rounded-2xl border-[3px] border-white/40 bg-white/20"><Globe2 /></span>
            <span className="min-w-0 flex-1">
              <strong className="block text-xl">Online preview</strong>
              <small className="font-bold opacity-80">Explore the local lobby shape</small>
            </span>
            <ArrowRight />
          </button>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-3xl border bg-card p-6">
          <p className="daykare-pattern-eyebrow">Seats and people</p>
          <div className="mt-4 space-y-3">
            <div className="daykare-seat-pattern">
              <span className="daykare-seat-avatar-pattern">Y</span>
              <span className="min-w-0">
                <strong className="block">You</strong>
                <small className="text-muted-foreground">Your toddler</small>
              </span>
              <Badge variant="secondary"><Check className="mr-1 size-3" /> Ready</Badge>
            </div>
            <div className="daykare-seat-pattern">
              <span className="daykare-seat-avatar-pattern bg-secondary text-secondary-foreground">M</span>
              <span className="min-w-0">
                <strong className="block">Mae</strong>
                <small className="text-muted-foreground">NPC toddler</small>
              </span>
              <Badge variant="outline">NPC</Badge>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border bg-card p-6">
          <p className="daykare-pattern-eyebrow">Choice rows</p>
          <div className="mt-4 space-y-3">
            <button type="button" className="daykare-choice-pattern">
              <Sparkles className="size-5 text-accent-foreground" />
              <span><strong className="block">Outfit</strong><small className="text-muted-foreground">Garden Scout</small></span>
              <span className="text-xs font-black uppercase tracking-wide text-muted-foreground">Next</span>
            </button>
            <button type="button" className="daykare-choice-pattern">
              <Users className="size-5 text-secondary-foreground" />
              <span><strong className="block">Room visibility</strong><small className="text-muted-foreground">Friends only</small></span>
              <span className="size-3 rounded-full border-[3px] border-secondary bg-card" />
            </button>
          </div>
        </section>
      </div>

      <section className="rounded-3xl border bg-card p-6">
        <p className="daykare-pattern-eyebrow">Pattern guidance</p>
        <div className="mt-4">
          <Guidelines items={[
            { kind: 'do', text: 'Give each destination action an icon, title, short description, and generous hit area.' },
            { kind: 'do', text: 'Pair avatars with text labels and explicit role or readiness states.' },
            { kind: 'do', text: 'Keep selectable rows visually stable when their value changes.' },
            { kind: 'dont', text: 'Promise live networking, purchases, or shared progression when the product is still a local preview.' },
          ]} />
        </div>
      </section>
    </div>
  );
}

export function ContentGuidelinesPage() {
  return (
    <section className="rounded-3xl border bg-card p-6">
      <p className="daykare-pattern-eyebrow">Voice and tone</p>
      <h2 className="mt-1 font-serif text-3xl font-black">Warm, direct, and truthful</h2>
      <p className="mt-3 max-w-2xl font-semibold leading-relaxed text-muted-foreground">
        DayKare speaks to children and families without talking down to them. Instructions name the
        next action; safety boundaries and preview limitations are stated plainly.
      </p>
      <div className="mt-6">
        <Guidelines items={[
          { kind: 'do', text: 'Use short verbs such as Continue, Open, Return, Choose, and Next.' },
          { kind: 'do', text: 'Name boundaries in positive, concrete language: “Kind play, clear boundaries.”' },
          { kind: 'do', text: 'State offline or preview-only behavior where the choice is made.' },
          { kind: 'dont', text: 'Use manipulative urgency, reward pressure, or vague claims about connectivity.' },
        ]} />
      </div>
    </section>
  );
}

export function MotionGuidelinesPage() {
  return (
    <section className="rounded-3xl border bg-card p-6">
      <p className="daykare-pattern-eyebrow">Responsive motion</p>
      <h2 className="mt-1 font-serif text-3xl font-black">Bouncy, never disorienting</h2>
      <p className="mt-3 max-w-2xl font-semibold leading-relaxed text-muted-foreground">
        Menus ease in, rows respond to press, and rewards can sparkle. Essential meaning remains
        available when animation is reduced or removed.
      </p>
      <div className="mt-6">
        <Guidelines items={[
          { kind: 'do', text: 'Use motion to explain entrance, press, and reward—not as a constant background effect.' },
          { kind: 'do', text: 'Honor prefers-reduced-motion and keep focus order unchanged.' },
          { kind: 'dont', text: 'Animate large camera or panel movement when a simpler fade communicates the same change.' },
        ]} />
      </div>
    </section>
  );
}