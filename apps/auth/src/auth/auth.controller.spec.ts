import { describe, it, expect, vi, beforeEach } from 'vitest'
import { UnauthorizedException } from '@nestjs/common'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { AuthGuard } from './auth.guard'

const TOKEN_PAIR = { accessToken: 'access.token', refreshToken: 'refresh.token' }

const makeAuthService = () => ({
  register: vi.fn().mockResolvedValue(TOKEN_PAIR),
  login: vi.fn().mockResolvedValue(TOKEN_PAIR),
  refresh: vi.fn().mockResolvedValue(TOKEN_PAIR),
  logout: vi.fn().mockResolvedValue(undefined),
  getUser: vi.fn().mockResolvedValue({ id: 'user-1', email: 'arif@example.com', workspaceId: 'ws-1', createdAt: new Date() }),
  verifyAccessToken: vi.fn(),
}) as unknown as AuthService

const makeRequest = (userId = 'user-1', workspaceId = 'ws-1') =>
  ({ user: { sub: userId, workspaceId, type: 'access' } }) as never

describe('AuthController', () => {
  let authService: ReturnType<typeof makeAuthService>
  let controller: AuthController

  beforeEach(() => {
    vi.clearAllMocks()
    authService = makeAuthService()
    const guard = new AuthGuard(authService)
    controller = new AuthController(authService)
    void guard
  })

  describe('register', () => {
    it('returns token pair', async () => {
      const result = await controller.register({
        email: 'arif@example.com',
        password: 'password123',
        workspaceName: 'My WS',
      })
      expect(result).toEqual(TOKEN_PAIR)
      expect(authService.register).toHaveBeenCalledWith({
        email: 'arif@example.com',
        password: 'password123',
        workspaceName: 'My WS',
      })
    })
  })

  describe('login', () => {
    it('returns token pair on valid credentials', async () => {
      const result = await controller.login({ email: 'arif@example.com', password: 'password123' })
      expect(result).toEqual(TOKEN_PAIR)
    })

    it('propagates UnauthorizedException on bad credentials', async () => {
      vi.mocked(authService.login).mockRejectedValue(new UnauthorizedException('invalid credentials'))
      await expect(controller.login({ email: 'bad@example.com', password: 'wrong' })).rejects.toThrow(
        UnauthorizedException,
      )
    })
  })

  describe('refresh', () => {
    it('returns new token pair', async () => {
      const result = await controller.refresh({ refreshToken: 'old.refresh.token' })
      expect(result).toEqual(TOKEN_PAIR)
      expect(authService.refresh).toHaveBeenCalledWith('old.refresh.token')
    })
  })

  describe('logout', () => {
    it('calls logout and returns nothing', async () => {
      await controller.logout({ refreshToken: 'refresh.token' })
      expect(authService.logout).toHaveBeenCalledWith('refresh.token')
    })
  })

  describe('me', () => {
    it('returns current user', async () => {
      const result = await controller.me(makeRequest())
      expect(result).toHaveProperty('email')
      expect(authService.getUser).toHaveBeenCalledWith('user-1')
    })
  })
})
