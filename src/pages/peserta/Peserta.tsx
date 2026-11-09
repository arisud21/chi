import { useStore } from '../../lib/store'

export function useMe() {
  const s = useStore((x) => x)
  const me = s.users.find((u) => u.id === s.sessionUserId)!
  const regs = s.registrations.filter((r) => r.userId === me.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return { s, me, regs }
}
