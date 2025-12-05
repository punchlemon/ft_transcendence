import { EventEmitter } from 'events';

class UserService extends EventEmitter {
  emitStatusChange(userId: number, status: string) {
    this.emit('status_change', { userId, status });
  }

  emitUserCreated(user: any) {
    this.emit('user_created', user);
  }

  emitUserUpdated(user: any) {
    this.emit('user_updated', user);
  }
}

export const userService = new UserService();
