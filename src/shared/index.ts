// 版本信息
export const VERSION = '1.0.0';

// 配置验证
export function isValidConfig(config: any): boolean {
  return (
    typeof config === 'object' &&
    config !== null &&
    typeof config.baseUrl === 'string' &&
    typeof config.shareId === 'string' &&
    config.baseUrl.length > 0 &&
    config.shareId.length > 0
  );
}

// 自定义错误类
export class UmamiError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'UmamiError';
  }
}