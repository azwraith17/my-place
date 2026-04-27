// Thin fetch wrappers. All requests are same-origin, credentials included via cookies.

async function request(method, url, body) {
  const opts = {
    method,
    credentials: 'include',
    headers: {},
  };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  if (res.status === 401) {
    location.href = `/login.html?next=${encodeURIComponent(location.pathname + location.search)}`;
    throw new Error('Unauthenticated');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status}: ${text}`);
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return res.text();
}

export const api = {
  get:    (url)        => request('GET',    url),
  post:   (url, body)  => request('POST',   url, body),
  patch:  (url, body)  => request('PATCH',  url, body),
  put:    (url, body)  => request('PUT',    url, body),
  delete: (url)        => request('DELETE', url),

  uploadBook(file) {
    const fd = new FormData();
    fd.append('file', file);
    return fetch('/api/books', {
      method: 'POST',
      credentials: 'include',
      body: fd,
    }).then(res => {
      if (!res.ok) return res.text().then(t => { throw new Error(t); });
      return res.json();
    });
  },
};
