import { useEffect, useState } from 'react'

/** Minimal hash router, so the app needs no routing dependency or server config. */
export type Route =
  | { name: 'home'; section?: 'browse' }
  | { name: 'item'; id: number }
  | { name: 'plan'; query: string }
  | { name: 'switchies' }
  | { name: 'requests' }

export const paths = {
  home: '#/',
  browse: '#/browse',
  item: (id: number) => `#/item/${id}`,
  plan: (query?: string) => (query ? `#/plan?q=${encodeURIComponent(query)}` : '#/plan'),
  switchies: '#/switchies',
  requests: '#/requests',
}

export function parseHash(hash: string): Route {
  const [path, search = ''] = hash.replace(/^#\/?/, '').split('?')
  const [first, second] = path.split('/').filter(Boolean)

  switch (first) {
    case 'item': {
      const id = Number(second)
      if (Number.isInteger(id)) return { name: 'item', id }
      break
    }
    case 'plan':
      return { name: 'plan', query: new URLSearchParams(search).get('q') ?? '' }
    case 'switchies':
      return { name: 'switchies' }
    case 'requests':
      return { name: 'requests' }
    case 'browse':
      return { name: 'home', section: 'browse' }
  }
  return { name: 'home' }
}

export function navigate(path: string) {
  window.location.hash = path
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash))

  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  return route
}
