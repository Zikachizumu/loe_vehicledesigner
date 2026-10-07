using CodeWalker.GameFiles;

namespace LoeVdPack;

// GTA V arşivlerine (RPF) okuma erişimi.
class Game
{
    public RpfManager Rpf { get; }
    Dictionary<string, List<RpfFileEntry>> byName;

    public Game(string gtaDir)
    {
        Console.WriteLine("GTA V anahtarları yükleniyor...");
        GTA5Keys.LoadFromPath(gtaDir, false, null);
        Rpf = new RpfManager();
        Console.WriteLine("RPF arşivleri taranıyor (bir dakika sürebilir)...");
        Rpf.Init(gtaDir, false, _ => { }, e => Console.Error.WriteLine("  ! " + e.Split('\n')[0]), false, true);
        byName = new Dictionary<string, List<RpfFileEntry>>();
        foreach (var rpf in Rpf.AllRpfs)
        {
            if (rpf.AllEntries == null) continue;
            foreach (var e in rpf.AllEntries)
            {
                if (e is not RpfFileEntry fe) continue;
                if (!byName.TryGetValue(fe.NameLower, out var list)) byName[fe.NameLower] = list = new List<RpfFileEntry>();
                list.Add(fe);
            }
        }
        Console.WriteLine($"{Rpf.AllRpfs.Count} arşiv, {byName.Count} dosya adı.");
    }

    public List<RpfFileEntry> Find(string name) =>
        byName.TryGetValue(name.ToLowerInvariant(), out var l) ? l : new List<RpfFileEntry>();

    public IEnumerable<RpfFileEntry> FindByExt(string ext) =>
        byName.Where(kv => kv.Key.EndsWith(ext)).SelectMany(kv => kv.Value);

    public T Load<T>(RpfFileEntry e) where T : class, PackedFile, new()
    {
        var data = e.File.ExtractFile(e);
        var f = new T();
        f.Load(data, e);
        return f;
    }

    // Aynı ada sahip birden fazla kayıt varsa en güncelini (yama/DLC) seç
    public RpfFileEntry Best(string name)
    {
        var l = Find(name);
        if (l.Count == 0) return null;
        int Score(RpfFileEntry e)
        {
            var p = e.Path.ToLowerInvariant();
            if (p.Contains("patchday") || p.Contains("dlcpatch")) return 3;
            if (p.StartsWith("update\\")) return 2;
            if (p.Contains("dlcpacks")) return 1;
            return 0;
        }
        return l.OrderBy(Score).ThenBy(e => e.Path).Last();
    }
}
