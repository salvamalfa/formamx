// Push al teléfono del taller vía ntfy.sh. Nunca debe tumbar al que llama:
// cualquier fallo se registra y se traga.
export async function notify(topic: string | undefined, title: string, body: string): Promise<void> {
  if (!topic) {
    console.error('ntfy: NTFY_TOPIC no configurado');
    return;
  }
  try {
    const res = await fetch(`https://ntfy.sh/${topic}`, {
      method: 'POST',
      // Los headers HTTP solo admiten latin1: el título va sin acentos.
      headers: { Title: title, Tags: 'package' },
      body,
    });
    if (!res.ok) {
      console.error('ntfy respondio', res.status, await res.text());
    }
  } catch (err) {
    console.error('ntfy fallo', err);
  }
}
