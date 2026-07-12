import { useState } from 'react';

export default function Monitors() {
  const [monitors] = useState<any[]>([]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Monitors</h1>
        <button className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          + Add Monitor
        </button>
      </div>
      {monitors.length === 0 ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-12 text-center">
          <p className="text-gray-400 mb-2">No monitors yet</p>
          <p className="text-gray-600 text-sm">Add a monitor to start tracking your site's health.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {monitors.map((m: any) => (
            <div key={m.id} className="bg-gray-900 rounded-xl border border-gray-800 p-4 flex items-center justify-between">
              <div>
                <p className="font-medium">{m.name}</p>
                <p className="text-sm text-gray-500">{m.url}</p>
              </div>
              <span className="text-xs px-2 py-1 rounded-full bg-green-500/10 text-green-400">UP</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
