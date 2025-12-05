import { EventEmitter } from 'events';

class UserService extends EventEmitter {
  emitStatusChange(userId: number, status: string) {
    console.log(`[Service] 📡 Emitting status_change for user ${userId}: ${status}`);
    this.emit('status_change', { userId, status });
  }

  emitUserCreated(user: any) {
    console.log(`[Service] 📡 Emitting user_created: ${user.id} (${user.displayName})`);
    this.emit('user_created', user);
  }

  emitUserUpdated(user: any) {
    console.log(`[Service] 📡 Emitting user_updated: ${user.id} (${user.displayName})`);
    this.emit('user_updated', user);
  }
}

export const userService = new UserService();
