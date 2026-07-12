import { useState } from 'react';

export default function Tests() {
  const [suites] = useState<any[]>([]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">E2E Tests</h1>
        <button className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          + New Suite
        </button>
      </div>
      {suites.length === 0 ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-12 text-center">
          <p className="text-gray-400 mb-2">No test suites yet</p>
          <p className="text-gray-600 text-sm">Create a suite to organize your E2E tests.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {suites.map((s: any) => (
            <div key={s.id} className="bg-gray-900 rounded-xl border border-gray-800 p-4">
              <p className="font-medium">{s.name}</p>
              <p className="text-sm text-gray-500">{s.description}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
