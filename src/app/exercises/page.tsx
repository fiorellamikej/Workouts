import { createClient } from '@/lib/supabase/server'
import { getYouTubeEmbedUrl } from '@/lib/utils'

export default async function ExercisesPage() {
  const supabase = await createClient()

  const { data: exercises } = await supabase
    .from('exercises')
    .select('*')
    .order('name')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Exercise Library</h1>
        <p className="mt-1 text-zinc-400">How-to videos and movement standards</p>
      </div>

      {!exercises?.length ? (
        <p className="text-zinc-400">No exercises added yet.</p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2">
          {exercises.map((ex) => {
            const embedUrl = getYouTubeEmbedUrl(ex.video_url)
            return (
              <div
                key={ex.id}
                className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden"
              >
                {embedUrl && (
                  <div className="aspect-video">
                    <iframe
                      src={embedUrl}
                      title={ex.name}
                      className="h-full w-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                )}
                <div className="p-5">
                  <h2 className="text-lg font-semibold text-orange-400">{ex.name}</h2>
                  {ex.muscle_groups?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {ex.muscle_groups.map((g: string) => (
                        <span
                          key={g}
                          className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300"
                        >
                          {g}
                        </span>
                      ))}
                    </div>
                  )}
                  {ex.description && (
                    <p className="mt-3 text-sm text-zinc-300 whitespace-pre-wrap">
                      {ex.description}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
