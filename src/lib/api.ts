import axios from 'axios';
import { toast } from 'sonner';
import { getApiBaseUrl } from './runtime';

const api = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 600000, // Increased to 600s for extremely slow provider responses
});

console.log('[API] Axios instance created with timeout:', api.defaults.timeout);

// Request interceptor for adding auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('ais-token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for global error handling
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    let message = error.response?.data?.error || error.message || '请求失败';
    
    // Ensure message is a string for toast
    if (typeof message === 'object' && message !== null) {
      message = (message as any).message || JSON.stringify(message);
    }
    
    if (error.code === 'ECONNABORTED') {
      message = '请求超时，请检查您的服务器网络状况或延长超时时间';
    } else if (error.message === 'Network Error') {
      message = '网络连接异常，请检查您的网络状况或稍后重试';
    }
    
    // Handle specific status codes
    if (error.response?.status === 401) {
      // Unauthorized - clear token and potentially redirect to login
      localStorage.removeItem('ais-token');
      localStorage.removeItem('ais-user');
      window.dispatchEvent(new Event('auth-expired'));
      
      // Only toast if it's not a background check
      const isBackgroundCheck = 
        error.config.url?.includes('/auth/me') || 
        error.config.url?.includes('/user/profile') ||
        error.config.url?.includes('/projects/list') ||
        error.config.url?.includes('/admin/config');
        
      if (!isBackgroundCheck && error.config.showToast !== false && error.config.silent !== true) {
        toast.error('会话已过期，请重新登录');
      }
    } else if (error.response?.status === 403) {
      if (error.config.showToast !== false && error.config.silent !== true) {
        toast.error(message);
      }
    } else if (error.response?.status >= 500) {
      if (error.config.showToast !== false && error.config.silent !== true) {
        toast.error(message || '服务器内部错误');
      }
    } else {
      // For other errors, we might want to handle them in the component
      // but we can still show a toast if it's a generic error
      if (error.config.showToast !== false && error.config.silent !== true) {
        toast.error(message);
      }
    }
    
    return Promise.reject(error);
  }
);

export default api;
