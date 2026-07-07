// Push al teléfono del taller vía ntfy.sh. Nunca debe tumbar al que llama:
// cualquier fallo se registra y se traga.
export async function notify(topic: string | undefined, title: string, body: string): Promise<void> {
  if (!topic) return;
  try {
    await fetch(`https://ntfy.sh/${topic}`, {
      method: 'POST',
      // Los headers HTTP solo admiten latin1: el título va sin acentos.
      headers: { Title: title, Tags: 'package' },
      body,
    });
  } catch (err) {
    console.error('ntfy fallo', err);
  }
}
