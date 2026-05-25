use rayon::ThreadPool;
use rayon::ThreadPoolBuilder;
use std::sync::OnceLock;

static POOL: OnceLock<ThreadPool> = OnceLock::new();

pub fn pool() -> &'static ThreadPool {
    POOL.get_or_init(|| {
        ThreadPoolBuilder::new()
            .build()
            .expect("failed to create rayon thread pool for Jepow engine jobs")
    })
}

pub fn parallel_job_count() -> usize {
    pool().current_num_threads()
}
