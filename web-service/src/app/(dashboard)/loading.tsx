export default function DashboardLoading() {
    return (
        <div className="space-y-6">
            {/* Header skeleton */}
            <div className="space-y-2">
                <div className="skeleton h-8 w-48" />
                <div className="skeleton h-4 w-72" />
            </div>

            {/* Card skeletons */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[0, 1, 2].map((i) => (
                    <div key={i} className="glass rounded-2xl p-5 space-y-3">
                        <div className="skeleton h-4 w-24" />
                        <div className="skeleton h-7 w-32" />
                    </div>
                ))}
            </div>

            {/* List skeleton */}
            <div className="glass rounded-2xl p-5 space-y-4">
                <div className="skeleton h-5 w-40" />
                {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="skeleton h-12 w-full" />
                ))}
            </div>
        </div>
    );
}
