import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { useAuth } from '../contexts/AuthContext';

interface Monitor {
  id: string;
  name: string;
  url: string;
  latestResult: { status: string; responseTimeMs: number } | null;
}

export default function DashboardScreen() {
  const { api } = useAuth();
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function fetchData() {
    try {
      const data = await api.get<Monitor[]>('/monitors');
      setMonitors(data);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => { fetchData(); }, []);

  const up = monitors.filter(m => m.latestResult?.status === 'up').length;
  const down = monitors.filter(m => m.latestResult?.status === 'down').length;

  return (
    <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} />}>
      <Text style={styles.title}>Dashboard</Text>

      {loading ? (
        <ActivityIndicator color="#4c6ef5" style={{ marginTop: 40 }} />
      ) : (
        <>
          <View style={styles.cardRow}>
            <View style={[styles.card, { borderLeftColor: '#4c6ef5' }]}>
              <Text style={styles.cardValue}>{monitors.length}</Text>
              <Text style={styles.cardLabel}>Monitors</Text>
            </View>
            <View style={[styles.card, { borderLeftColor: '#22c55e' }]}>
              <Text style={styles.cardValue}>{up}</Text>
              <Text style={styles.cardLabel}>Healthy</Text>
            </View>
            <View style={[styles.card, { borderLeftColor: down > 0 ? '#ef4444' : '#22c55e' }]}>
              <Text style={styles.cardValue}>{down}</Text>
              <Text style={styles.cardLabel}>Down</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Monitors</Text>
          {monitors.length === 0 ? (
            <Text style={styles.emptyText}>No monitors configured yet.</Text>
          ) : (
            monitors.slice(0, 10).map(m => (
              <View key={m.id} style={styles.monitorRow}>
                <View style={[styles.statusDot, { backgroundColor: m.latestResult?.status === 'up' ? '#22c55e' : m.latestResult?.status === 'down' ? '#ef4444' : '#52525b' }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.monitorName}>{m.name}</Text>
                  <Text style={styles.monitorUrl} numberOfLines={1}>{m.url}</Text>
                </View>
                <Text style={styles.monitorStatus}>
                  {m.latestResult?.status === 'up' ? 'UP' : m.latestResult?.status === 'down' ? 'DOWN' : '--'}
                </Text>
              </View>
            ))
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090b', padding: 16 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 16, marginTop: 8 },
  cardRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  card: { flex: 1, backgroundColor: '#18181b', borderRadius: 10, padding: 14, borderLeftWidth: 3 },
  cardValue: { fontSize: 26, fontWeight: 'bold', color: '#fff' },
  cardLabel: { fontSize: 11, color: '#71717a', marginTop: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#d4d4d8', marginBottom: 10 },
  emptyText: { color: '#52525b', fontSize: 14, textAlign: 'center', marginTop: 20 },
  monitorRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#18181b', borderRadius: 8, padding: 12, marginBottom: 6, gap: 10 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  monitorName: { fontSize: 14, fontWeight: '500', color: '#e4e4e7' },
  monitorUrl: { fontSize: 11, color: '#52525b', marginTop: 1 },
  monitorStatus: { fontSize: 12, fontWeight: '700', color: '#a1a1aa' },
});
