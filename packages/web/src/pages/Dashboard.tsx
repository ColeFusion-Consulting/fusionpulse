export default function Dashboard() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard title="Uptime" value="99.9%" color="green" />
        <StatCard title="Tests Passing" value="47/50" color="blue" />
        <StatCard title="AI Generations" value="128" color="purple" />
      </div>
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
        <p className="text-gray-500 text-sm">No activity yet. Add a monitor or create a test to get started.</p>
      </div>
    </div>
  );
}

function StatCard({ title, value, color }: { title: string; value: string; color: string }) {
  const colors: Record<string, string> = {
    green: 'text-green-400',
    blue: 'text-blue-400',
    purple: 'text-purple-400',
  };
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
      <p className="text-sm text-gray-400 mb-1">{title}</p>
      <p className={`text-3xl font-bold ${colors[color]}`}>{value}</p>
    </div>
  );
}
