import { describe, it, expect, beforeEach } from 'vitest'
import { randomBytes } from 'node:crypto'
import { ConfigService } from '@nestjs/config'
import { EncryptionService } from './encryption.service'

const TEST_KEY = randomBytes(32).toString('hex')

const makeConfig = () =>
  ({ get: () => TEST_KEY }) as unknown as ConfigService

describe('EncryptionService', () => {
  let service: EncryptionService

  beforeEach(() => {
    service = new EncryptionService(makeConfig())
  })

  describe('encrypt', () => {
    it('returns a hex-encoded ciphertext and iv', () => {
      const { encrypted, iv } = service.encrypt('{"token":"secret"}')
      expect(encrypted).toMatch(/^[0-9a-f]+$/)
      expect(iv).toMatch(/^[0-9a-f]{24}$/) // 12 bytes = 24 hex chars
    })

    it('produces different ciphertexts for the same plaintext (random IV)', () => {
      const a = service.encrypt('same text')
      const b = service.encrypt('same text')
      expect(a.encrypted).not.toBe(b.encrypted)
      expect(a.iv).not.toBe(b.iv)
    })
  })

  describe('decrypt', () => {
    it('round-trips plaintext correctly', () => {
      const plaintext = JSON.stringify({ apiKey: 'sk-live-abc123', region: 'us-east-1' })
      const { encrypted, iv } = service.encrypt(plaintext)
      expect(service.decrypt(encrypted, iv)).toBe(plaintext)
    })

    it('throws when ciphertext has been tampered', () => {
      const { encrypted, iv } = service.encrypt('{"token":"secret"}')
      const tampered = encrypted.slice(0, -4) + 'ffff'
      expect(() => service.decrypt(tampered, iv)).toThrow()
    })

    it('throws when iv is wrong', () => {
      const { encrypted } = service.encrypt('{"token":"secret"}')
      const wrongIv = randomBytes(12).toString('hex')
      expect(() => service.decrypt(encrypted, wrongIv)).toThrow()
    })
  })
})
