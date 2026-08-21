/**
 * URL 安全策略
 *
 * 提供纯函数形式的 URL 与 IP 地址校验，供材料抓取在初始校验、
 * 重定向目标校验和 DNS 解析后校验三个环节复用。不涉及网络访问。
 */

/** 去除 IPv6 方括号并统一为小写 */
function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[|\]$/g, '')
}

/**
 * 将主机名中的 IPv4 或 IPv4 映射的 IPv6 地址规范化为点分十进制 IPv4。
 * 对普通域名返回 null。
 */
function toIpv4(hostname: string): string | null {
  const host = normalizeHost(hostname)
  if (host === '') return null

  // 点分十进制 IPv4（URL 解析器已将十进制/十六进制/八进制记法规范化为该形式）
  const parts = host.split('.')
  if (parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)) {
    return host
  }

  // IPv4 映射的 IPv6（点分形式）：::ffff:127.0.0.1
  const dotted = host.match(/^(?:::ffff:|0:0:0:0:0:ffff:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  if (dotted && dotted[1].split('.').every((part) => Number(part) <= 255)) {
    return dotted[1]
  }

  // IPv4 映射的 IPv6（十六进制形式）：::ffff:7f00:1
  const hex = host.match(/^(?:::ffff:|0:0:0:0:0:ffff:)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (hex) {
    const first = Number.parseInt(hex[1], 16)
    const second = Number.parseInt(hex[2], 16)
    return `${first >> 8}.${first & 0xff}.${second >> 8}.${second & 0xff}`
  }

  return null
}

/** 是否为回环地址（loopback），覆盖 127.0.0.0/8、::1 及 IPv4 映射的 127.x */
export function isLoopbackHost(hostname: string): boolean {
  const host = normalizeHost(hostname)
  if (host === 'localhost' || host === '::1' || host === '0:0:0:0:0:0:0:1') return true
  const ipv4 = toIpv4(host)
  if (!ipv4) return false
  return ipv4.startsWith('127.')
}

/** 是否为私有网段地址（10/8、172.16/12、192.168/16） */
export function isPrivateHost(hostname: string): boolean {
  const host = normalizeHost(hostname)
  const ipv4 = toIpv4(hostname)
  if (!ipv4) {
    return /^f[cd][0-9a-f]{2}(?::|$)/.test(host)
  }
  const [a, b] = ipv4.split('.').map((part) => Number(part))
  if (a === 10) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  return false
}

/** 是否为链路本地地址（169.254/16） */
export function isLinkLocal(hostname: string): boolean {
  const host = normalizeHost(hostname)
  const ipv4 = toIpv4(hostname)
  if (!ipv4) return /^fe[89ab][0-9a-f](?::|$)/.test(host)
  const [a, b] = ipv4.split('.').map((part) => Number(part))
  return a === 169 && b === 254
}

/** 是否为云元数据地址（169.254.169.254） */
export function isMetadataHost(hostname: string): boolean {
  return toIpv4(hostname) === '169.254.169.254'
}

function isUnspecifiedHost(hostname: string): boolean {
  const host = normalizeHost(hostname)
  return host === '::' || host === '0:0:0:0:0:0:0:0' || toIpv4(host) === '0.0.0.0'
}

function ipv4Number(address: string): number | null {
  const ipv4 = toIpv4(address)
  if (!ipv4) return null
  return ipv4.split('.').reduce((value, part) => value * 256 + Number(part), 0) >>> 0
}

function ipv4InCidr(address: number, base: string, prefix: number): boolean {
  const baseNumber = ipv4Number(base)
  if (baseNumber === null) return false
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
  return (address & mask) === (baseNumber & mask)
}

function ipv6Number(address: string): bigint | null {
  const host = normalizeHost(address)
  if (!host.includes(':')) return null
  const mapped = toIpv4(host)
  if (mapped) return null
  const halves = host.split('::')
  if (halves.length > 2) return null
  const left = halves[0] ? halves[0].split(':') : []
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const missing = 8 - left.length - right.length
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null
  const groups = [...left, ...Array(missing).fill('0'), ...right]
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null
  return groups.reduce((value, group) => (value << 16n) | BigInt(`0x${group}`), 0n)
}

function ipv6InCidr(address: bigint, base: string, prefix: number): boolean {
  const baseNumber = ipv6Number(base)
  if (baseNumber === null) return false
  const shift = BigInt(128 - prefix)
  return (address >> shift) === (baseNumber >> shift)
}

const BLOCKED_IPV4_CIDRS: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]
]

const BLOCKED_IPV6_CIDRS: ReadonlyArray<readonly [string, number]> = [
  ['::', 128], ['::1', 128], ['64:ff9b::', 96], ['64:ff9b:1::', 48], ['100::', 64],
  ['2001::', 32], ['2001:2::', 48], ['2001:10::', 28], ['2001:20::', 28],
  ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20], ['5f00::', 16],
  ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8]
]

/**
 * 校验材料 URL 是否可安全抓取。
 * 仅允许公网 HTTPS，拒绝回环、私有网段、链路本地和元数据地址。
 * @returns 是否通过校验
 */
export function validatePublicHttpsUrl(rawUrl: string): boolean {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return false
  }

  if (url.protocol !== 'https:') return false
  if (url.username !== '' || url.password !== '') return false

  const hostname = url.hostname
  if (hostname === '') return false

  const normalized = normalizeHost(hostname)
  if (toIpv4(normalized) || normalized.includes(':')) {
    return isSafeIpAddress(normalized)
  }

  return !(
    isLoopbackHost(hostname) ||
    isUnspecifiedHost(hostname) ||
    isPrivateHost(hostname) ||
    isLinkLocal(hostname) ||
    isMetadataHost(hostname)
  )
}

/** @deprecated Use validatePublicHttpsUrl. Kept until downstream material callers migrate. */
export const validateMaterialUrl = validatePublicHttpsUrl

/**
 * 校验解析出的 IP 地址是否安全。
 * @returns 是否允许访问该地址
 */
export function isSafeIpAddress(address: string): boolean {
  const ipv4 = ipv4Number(address)
  if (ipv4 !== null) {
    return !BLOCKED_IPV4_CIDRS.some(([base, prefix]) => ipv4InCidr(ipv4, base, prefix))
  }
  const ipv6 = ipv6Number(address)
  if (ipv6 === null) return false
  return !BLOCKED_IPV6_CIDRS.some(([base, prefix]) => ipv6InCidr(ipv6, base, prefix))
}
