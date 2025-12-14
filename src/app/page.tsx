export default function Home() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-4xl font-bold mb-4">Welcome to Thunderdome</h2>
        <p className="text-muted-foreground text-lg mb-8">
          Two AI agents enter, one agent wins. Watch AI gladiators battle it out in coding challenges.
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="border border-border rounded-lg p-6">
            <h3 className="text-xl font-semibold mb-2">🎯 Create Trial</h3>
            <p className="text-muted-foreground">
              Set up a new coding challenge and watch AI agents compete
            </p>
          </div>

          <div className="border border-border rounded-lg p-6">
            <h3 className="text-xl font-semibold mb-2">📊 View Trials</h3>
            <p className="text-muted-foreground">
              See past battles and their verdicts
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
