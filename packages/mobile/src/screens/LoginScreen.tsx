import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useAuth } from '../contexts/AuthContext';

export default function LoginScreen({ navigation }: any) {
  const [mode, setMode] = useState<'user' | 'root'>('user');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, rootLogin } = useAuth();

  async function handleLogin() {
    setLoading(true);
    try {
      if (mode === 'user') await login(email, password);
      else await rootLogin(username, password);
    } catch (e: any) {
      Alert.alert('Login Failed', e.message);
    }
    setLoading(false);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>FusionPulse</Text>
      <Text style={styles.subtitle}>AI Testing by ColeFusion</Text>

      <View style={styles.toggleRow}>
        <TouchableOpacity style={[styles.toggleBtn, mode === 'user' && styles.toggleActive]} onPress={() => setMode('user')}>
          <Text style={[styles.toggleText, mode === 'user' && styles.toggleTextActive]}>User</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.toggleBtn, mode === 'root' && styles.toggleRootActive]} onPress={() => setMode('root')}>
          <Text style={[styles.toggleText, mode === 'root' && styles.toggleTextActive]}>Root</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.form}>
        {mode === 'user' ? (
          <TextInput style={styles.input} placeholder="Email" placeholderTextColor="#52525b" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        ) : (
          <TextInput style={styles.input} placeholder="Username" placeholderTextColor="#52525b" value={username} onChangeText={setUsername} autoCapitalize="none" />
        )}
        <TextInput style={styles.input} placeholder="Password" placeholderTextColor="#52525b" value={password} onChangeText={setPassword} secureTextEntry />

        <TouchableOpacity style={[styles.submitBtn, mode === 'root' && styles.submitBtnRoot]} onPress={handleLogin} disabled={loading}>
          {loading ? <ActivityIndicator color="#09090b" /> : <Text style={styles.submitText}>Sign In</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090b', justifyContent: 'center', padding: 24 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#4c6ef5', textAlign: 'center' },
  subtitle: { fontSize: 12, color: '#71717a', textAlign: 'center', marginTop: 4, marginBottom: 32 },
  toggleRow: { flexDirection: 'row', backgroundColor: '#18181b', borderRadius: 8, padding: 3, marginBottom: 20 },
  toggleBtn: { flex: 1, paddingVertical: 10, borderRadius: 6, alignItems: 'center' },
  toggleActive: { backgroundColor: '#4c6ef5' },
  toggleRootActive: { backgroundColor: '#dc2626' },
  toggleText: { fontSize: 14, fontWeight: '600', color: '#a1a1aa' },
  toggleTextActive: { color: '#ffffff' },
  form: { gap: 12 },
  input: { backgroundColor: '#18181b', borderWidth: 1, borderColor: '#27272a', borderRadius: 8, padding: 14, fontSize: 15, color: '#fff' },
  submitBtn: { backgroundColor: '#4c6ef5', paddingVertical: 14, borderRadius: 8, alignItems: 'center', marginTop: 4 },
  submitBtnRoot: { backgroundColor: '#dc2626' },
  submitText: { fontSize: 15, fontWeight: '600', color: '#09090b' },
});
