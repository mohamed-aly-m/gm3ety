// Lightweight in-memory and sessionStorage cache for associations to guarantee instant UI rendering
class AssociationCache {
  constructor() {
    this.memoryCache = new Map();
  }

  getKey(id) {
    return `gam3ety_assoc_cache_${id}`;
  }

  get(id) {
    if (!id) return null;
    if (this.memoryCache.has(id)) {
      return this.memoryCache.get(id);
    }
    if (typeof sessionStorage !== "undefined") {
      try {
        const stored = sessionStorage.getItem(this.getKey(id));
        if (stored) {
          const parsed = JSON.parse(stored);
          this.memoryCache.set(id, parsed);
          return parsed;
        }
      } catch (e) {
        console.warn("Error reading association cache:", e);
      }
    }
    return null;
  }

  set(id, data) {
    if (!id || !data) return;
    this.memoryCache.set(id, data);
    if (typeof sessionStorage !== "undefined") {
      try {
        sessionStorage.setItem(this.getKey(id), JSON.stringify(data));
      } catch (e) {
        console.warn("Error storing association cache:", e);
      }
    }
  }

  update(id, partial) {
    const current = this.get(id);
    if (current) {
      const updated = { ...current, ...partial };
      this.set(id, updated);
    }
  }

  invalidate(id) {
    if (!id) return;
    this.memoryCache.delete(id);
    if (typeof sessionStorage !== "undefined") {
      try {
        sessionStorage.removeItem(this.getKey(id));
      } catch (e) {
        console.warn("Error invalidating association cache:", e);
      }
    }
  }

  clear() {
    this.memoryCache.clear();
  }
}

export const associationCache = new AssociationCache();
