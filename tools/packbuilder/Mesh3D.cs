using CodeWalker.GameFiles;
using SharpDX;
using System.IO.Compression;
using System.Text;
using System.Text.Json;

namespace LoeVdPack;

// vdpack mesh3d --yft <dir> --out <dir> [--models a,b | --all] [--no-interior]
// Araç modelini LOE Vehicle Studio'nun 3B görüntüleyicisi için kompakt .lvm.gz biçimine çevirir.
//
//   "LVM1" | u32 başlık uzunluğu | JSON başlık (4 bayta hizalı) | konumlar (u16 x3) | normaller (i8 x4) | indeksler (u16/u32)
//
// Köşeler araç uzayında (dinlenme pozu). Üçgenler (kemik, malzeme sınıfı) gruplarına ayrılır; kapı/kaput animasyonu
// ve kemik görünürlüğü grup düzeyinde çalışır.
static class Mesh3D
{
    static bool useHi;

    // 0 boya, 1 cam, 2 metal/ızgara, 3 lastik/palet, 4 far/ışık, 5 iç mekan, 6 detay (plaka/rozet/çıkartma), 7 diğer
    static int Classify(string sh)
    {
        if (sh.StartsWith("vehicle_paint")) return 0;
        if (sh.StartsWith("vehicle_vehglass")) return 1;
        if (sh.StartsWith("vehicle_tire") || sh.StartsWith("vehicle_track")) return 3;
        if (sh.StartsWith("vehicle_lights") || sh.StartsWith("vehicle_lightsemissive") || sh.Contains("emissive")) return 4;
        if (sh.StartsWith("vehicle_interior") || sh.StartsWith("vehicle_dash") || sh.StartsWith("vehicle_cloth")) return 5;
        if (sh.StartsWith("vehicle_licenseplate") || sh.StartsWith("vehicle_badges") || sh.StartsWith("vehicle_decal") || sh.StartsWith("vehicle_detail")) return 6;
        if (sh.StartsWith("vehicle_mesh") || sh.StartsWith("vehicle_shuts")) return 2;
        return 7;
    }

    static string Arg(string[] a, string k, string def = null)
    {
        for (int i = 0; i < a.Length - 1; i++) if (a[i] == k) return a[i + 1];
        return def;
    }

    public static int Run(string[] args)
    {
        var yftDir = Arg(args, "--yft", "out/yft");
        var outDir = Arg(args, "--out", "out/meshes");
        bool noInterior = args.Contains("--no-interior");
        useHi = args.Contains("--hi");
        Directory.CreateDirectory(outDir);
        List<string> models;
        if (args.Contains("--all"))
            models = Directory.GetFiles(yftDir, "*.yft").Select(f => Path.GetFileNameWithoutExtension(f)).Where(n => !n.EndsWith("_hi")).OrderBy(n => n).ToList();
        else
            models = (Arg(args, "--models") ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Select(s => s.ToLowerInvariant()).ToList();
        if (models.Count == 0) throw new ArgumentException("model yok");

        var index = new List<object>();
        long total = 0;
        int ok = 0, fail = 0;
        foreach (var model in models)
        {
            try
            {
                var (file, info) = Convert(yftDir, outDir, model, noInterior);
                total += new FileInfo(file).Length;
                index.Add(info);
                ok++;
            }
            catch (Exception ex)
            {
                fail++;
                Console.WriteLine($"  ! {model}: {ex.Message}");
            }
        }
        File.WriteAllText(Path.Combine(outDir, "index.json"), JsonSerializer.Serialize(index), new UTF8Encoding(false));
        Console.WriteLine($"mesh3d: {ok} model, {fail} hata, {total / 1024 / 1024.0:0.0} MB → {outDir}");
        return ok > 0 ? 0 : 2;
    }

    static (string file, object info) Convert(string yftDir, string outDir, string model, bool noInterior)
    {
        var m = VehicleMesh.Load(yftDir, model, useHi);
        int nb = m.Bones.Length;

        // üçgenleri (kemik, sınıf) anahtarına göre ayır
        var tris = new List<(int bone, int cls, int a, int b, int c)>();
        for (int ti = 0; ti < m.Tris.Count; ti++)
        {
            var t = m.Tris[ti];
            int cls = Classify(m.TriShader[ti]);
            if (noInterior && cls == 5) continue;
            int bone = m.VBone[t[0]];
            if (m.VBone[t[1]] == m.VBone[t[2]]) bone = m.VBone[t[1]];
            if (bone < 0 || bone >= Math.Max(1, nb)) bone = 0;
            tris.Add((bone, cls, t[0], t[1], t[2]));
        }
        if (tris.Count == 0) throw new Exception("üçgen yok");
        tris.Sort((x, y) => x.bone != y.bone ? x.bone.CompareTo(y.bone) : x.cls.CompareTo(y.cls));

        // kullanılan köşeleri yeniden numaralandır
        var remap = new Dictionary<int, int>();
        var pos = new List<Vector3>();
        var nrm = new List<Vector3>();
        int Map(int v)
        {
            if (!remap.TryGetValue(v, out int r))
            {
                r = pos.Count;
                remap[v] = r;
                pos.Add(m.P[v]);
                nrm.Add(m.N[v]);
            }
            return r;
        }
        var idx = new List<int>(tris.Count * 3);
        var groups = new List<Dictionary<string, object>>();
        int gs = 0, gb = tris[0].bone, gc = tris[0].cls;
        for (int i = 0; i < tris.Count; i++)
        {
            var t = tris[i];
            if (t.bone != gb || t.cls != gc)
            {
                groups.Add(new() { ["b"] = gb, ["c"] = gc, ["s"] = gs, ["n"] = idx.Count - gs });
                gs = idx.Count; gb = t.bone; gc = t.cls;
            }
            idx.Add(Map(t.a)); idx.Add(Map(t.b)); idx.Add(Map(t.c));
        }
        groups.Add(new() { ["b"] = gb, ["c"] = gc, ["s"] = gs, ["n"] = idx.Count - gs });

        var mn = new Vector3(float.MaxValue); var mx = new Vector3(float.MinValue);
        foreach (var p in pos) { mn = Vector3.Min(mn, p); mx = Vector3.Max(mx, p); }
        var size = mx - mn;
        float sx = Math.Max(size.X, 1e-4f), sy = Math.Max(size.Y, 1e-4f), sz = Math.Max(size.Z, 1e-4f);
        bool wide = pos.Count > 65535;

        var bones = new List<object>();
        for (int i = 0; i < nb; i++)
        {
            var b = m.Bones[i];
            var t = m.Abs[i].TranslationVector;
            bones.Add(new { n = b.Name ?? ("bone" + i), p = (int)b.ParentIndex, t = new[] { Round(t.X), Round(t.Y), Round(t.Z) } });
        }

        var header = new Dictionary<string, object>
        {
            ["model"] = model,
            ["bbox"] = new { min = new[] { Round(m.BBMin.X), Round(m.BBMin.Y), Round(m.BBMin.Z) }, max = new[] { Round(m.BBMax.X), Round(m.BBMax.Y), Round(m.BBMax.Z) } },
            ["pmin"] = new[] { mn.X, mn.Y, mn.Z },
            ["psize"] = new[] { sx, sy, sz },
            ["vcount"] = pos.Count,
            ["icount"] = idx.Count,
            ["wide"] = wide,
            ["bones"] = bones,
            ["groups"] = groups,
        };
        var hjson = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(header));
        int hpad = (4 - hjson.Length % 4) % 4;

        var ms = new MemoryStream();
        using (var bw = new BinaryWriter(ms, Encoding.UTF8, true))
        {
            bw.Write(Encoding.ASCII.GetBytes("LVM1"));
            bw.Write((uint)(hjson.Length + hpad));
            bw.Write(hjson);
            for (int i = 0; i < hpad; i++) bw.Write((byte)32);
            foreach (var p in pos)
            {
                bw.Write(Q16((p.X - mn.X) / sx));
                bw.Write(Q16((p.Y - mn.Y) / sy));
                bw.Write(Q16((p.Z - mn.Z) / sz));
            }
            if ((pos.Count * 6) % 4 != 0) bw.Write((ushort)0);
            foreach (var n in nrm)
            {
                bw.Write(Q8(n.X)); bw.Write(Q8(n.Y)); bw.Write(Q8(n.Z)); bw.Write((sbyte)0);
            }
            if (wide) foreach (var i in idx) bw.Write((uint)i);
            else foreach (var i in idx) bw.Write((ushort)i);
        }

        var file = Path.Combine(outDir, model + ".lvm.gz");
        using (var fs = File.Create(file))
        using (var gz = new GZipStream(fs, CompressionLevel.SmallestSize))
            gz.Write(ms.ToArray());

        int paintTris = tris.Count(t => t.cls == 0);
        var doors = Enumerable.Range(0, nb).Select(i => m.Bones[i].Name ?? "").Count(n => n.StartsWith("door_"));
        var info = new
        {
            id = model,
            kb = (int)(new FileInfo(file).Length / 1024),
            verts = pos.Count,
            tris = tris.Count,
            paint = paintTris,
            bones = nb,
            doors,
            len = Round(m.BBMax.Y - m.BBMin.Y),
            wid = Round(m.BBMax.X - m.BBMin.X),
            hei = Round(m.BBMax.Z - m.BBMin.Z),
        };
        return (file, info);
    }

    static float Round(float v) => (float)Math.Round(v, 4);
    static ushort Q16(float t) => (ushort)Math.Clamp((int)Math.Round(t * 65535f), 0, 65535);
    static sbyte Q8(float v) => (sbyte)Math.Clamp((int)Math.Round(v * 127f), -127, 127);
}
