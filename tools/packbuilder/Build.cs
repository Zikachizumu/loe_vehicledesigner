using CodeWalker.GameFiles;
using SharpDX;
using System.Text;

namespace LoeVdPack;

// vdpack build --yft <klasör> --out <klasör> --name <paket> --models a,b,c [--slots 4] [--offset 0.004] [--size 4096] [--lod 150] [--preview]
static class Build
{
    static string Arg(string[] a, string k, string d = null)
    {
        int i = Array.IndexOf(a, k);
        return i >= 0 && i + 1 < a.Length ? a[i + 1] : d;
    }

    public static int Run(string[] args)
    {
        var yftDir = Arg(args, "--yft") ?? throw new ArgumentException("--yft gerekli");
        var outDir = Arg(args, "--out") ?? "out";
        var pack = Arg(args, "--name") ?? "loe_vd_pack";
        var models = (Arg(args, "--models") ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Select(s => s.ToLowerInvariant()).ToList();
        int slots = int.Parse(Arg(args, "--slots", "4"));
        float offset = float.Parse(Arg(args, "--offset", "0.004"), System.Globalization.CultureInfo.InvariantCulture);
        int size = int.Parse(Arg(args, "--size", "4096"));
        float lod = float.Parse(Arg(args, "--lod", "150"), System.Globalization.CultureInfo.InvariantCulture);
        bool preview = args.Contains("--preview");
        if (models.Count == 0) throw new ArgumentException("--models boş");

        var dir = Path.Combine(outDir, pack);
        var stream = Path.Combine(dir, "stream_enhanced");
        var surfaces = Path.Combine(dir, "surfaces");
        var prevDir = Path.Combine(outDir, pack + "_preview");
        Directory.CreateDirectory(stream);
        Directory.CreateDirectory(surfaces);
        if (preview) Directory.CreateDirectory(prevDir);
        var tmp = Path.Combine(outDir, ".tmp_" + pack);

        var archs = new List<(string name, string txd, Vector3 min, Vector3 max, float lod)>();
        var built = new List<string>();
        var report = new StringBuilder();
        long bytes = 0;

        foreach (var model in models)
        {
            try
            {
                var sw = System.Diagnostics.Stopwatch.StartNew();
                var mesh = VehicleMesh.Load(yftDir, model, true);
                var r = ShellBuilder.Build(mesh, size, offset);
                if (r.Parts.Count == 0)
                {
                    Console.WriteLine($"  ! {model}: boya yüzeyi yok (shaders: {string.Join(",", mesh.Shaders)})");
                    continue;
                }
                var txd = "loe_vd_" + model;
                var tex = new List<(string, byte, byte, byte, byte, string)>();
                for (int k = 1; k <= slots; k++) tex.Add(($"loe_vd_{model}_s{k}", 0, 0, 0, 0, "DIFFUSE"));
                tex.Add((PackWriter.FlatNormal, 255, 128, 128, 255, "NORMAL"));
                tex.Add((PackWriter.SpecMap, 200, 200, 200, 255, "SPECULAR"));
                var ytd = PackWriter.Ytd(tex, Path.Combine(tmp, model));
                File.WriteAllBytes(Path.Combine(stream, txd + ".ytd"), ytd);
                bytes += ytd.Length;

                foreach (var part in r.Parts)
                {
                    var pname = PackWriter.Sanitize(part.Bone);
                    var template = PackWriter.YdrXml("@NAME@", part, "@TEX@", lod);
                    for (int k = 1; k <= slots; k++)
                    {
                        var name = $"loe_vd_{model}_{pname}_s{k}";
                        if (name.Length > 63) throw new Exception("model adı çok uzun: " + name);
                        var xml = template.Replace("@NAME@", name).Replace("@TEX@", $"loe_vd_{model}_s{k}");
                        var ydr = PackWriter.Ydr(xml);
                        File.WriteAllBytes(Path.Combine(stream, name + ".ydr"), ydr);
                        bytes += ydr.Length;
                        archs.Add((name, txd, part.Min, part.Max, lod));
                    }
                }
                File.WriteAllText(Path.Combine(surfaces, model + ".json"), PackWriter.SurfaceJson(model, size, slots, r, mesh.BBMin, mesh.BBMax), new UTF8Encoding(false));
                File.WriteAllBytes(Path.Combine(surfaces, model + ".png"), PackWriter.Template(r, 1024));
                if (preview)
                {
                    File.WriteAllBytes(Path.Combine(prevDir, model + "_left.png"), Raster.Preview(mesh, r, size, new Vector3(1, 0, 0), Vector3.UnitZ, 900, 420));
                    File.WriteAllBytes(Path.Combine(prevDir, model + "_right.png"), Raster.Preview(mesh, r, size, new Vector3(-1, 0, 0), Vector3.UnitZ, 900, 420));
                    File.WriteAllBytes(Path.Combine(prevDir, model + "_top.png"), Raster.Preview(mesh, r, size, new Vector3(0, 0, -1), Vector3.UnitY, 900, 900));
                    File.WriteAllBytes(Path.Combine(prevDir, model + "_34.png"), Raster.Preview(mesh, r, size, new Vector3(0.75f, -0.85f, -0.45f), Vector3.UnitZ, 900, 600));
                }
                built.Add(model);
                var line = $"  {model,-14} parça={r.Parts.Count} boya üçg={r.PaintTris} dış={r.KeptTris} köşe={r.Parts.Sum(p => p.V.Count)} kemikler=[{string.Join(",", r.Parts.Select(p => p.Bone))}] {sw.ElapsedMilliseconds}ms";
                Console.WriteLine(line);
                report.AppendLine(line);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"  ! {model}: {ex.Message}");
                report.AppendLine($"  ! {model}: {ex}");
            }
        }

        if (built.Count == 0) { Console.WriteLine("hiç model üretilemedi"); return 2; }
        File.WriteAllBytes(Path.Combine(stream, pack + ".ytyp"), PackWriter.Ytyp(pack, archs));
        PackWriter.WriteManifest(dir, pack, built);
        File.WriteAllText(Path.Combine(outDir, pack + "_report.txt"), report.ToString());
        try { Directory.Delete(tmp, true); } catch { }
        Console.WriteLine($"{pack}: {built.Count} model, {archs.Count} arketip, {bytes / 1024 / 1024.0:0.0} MB → {dir}");
        return 0;
    }
}

// vdpack verify <paket klasörü>: üretilen dosyaları CodeWalker ile geri okur
static class Verify
{
    static byte[] Raw(string path, out RpfResourceFileEntry entry)
    {
        var data = File.ReadAllBytes(path);
        entry = RpfFile.CreateResourceFileEntry(ref data, 0);
        entry.Name = Path.GetFileName(path);
        entry.NameLower = entry.Name.ToLowerInvariant();
        return ResourceBuilder.Decompress(data);
    }

    public static int Run(string dir)
    {
        int bad = 0, ydrs = 0;
        RpfManager.IsGen9 = true;   // stream_enhanced: gen9 dosyaları
        foreach (var f in Directory.GetFiles(Path.Combine(dir, "stream_enhanced")))
        {
            try
            {
                var ext = Path.GetExtension(f).ToLowerInvariant();
                if (ext == ".ydr")
                {
                    var d = Raw(f, out var e);
                    var y = new YdrFile(e); y.Load(d, e);
                    var g = y.Drawable?.DrawableModels?.High?.FirstOrDefault()?.Geometries;
                    if (g == null || g.Length == 0) throw new Exception("geometri yok");
                    var sh = y.Drawable.ShaderGroup?.Shaders?.data_items?.FirstOrDefault();
                    var tex = sh?.ParametersList?.Parameters?.FirstOrDefault(p => p.Data is TextureBase)?.Data as TextureBase;
                    if (ydrs++ < 3) Console.WriteLine($"  {Path.GetFileName(f)}: geom={g.Length} v={g.Sum(x => x.VerticesCount)} shader={VehicleMesh.ShaderName(sh)} tex={tex?.Name}");
                }
                else if (ext == ".ytd")
                {
                    var d = Raw(f, out var e);
                    var y = new YtdFile(e); y.Load(d, e);
                    var n = y.TextureDict?.Textures?.data_items?.Length ?? 0;
                    if (n == 0) throw new Exception("doku yok");
                    Console.WriteLine($"  {Path.GetFileName(f)}: {n} doku ({string.Join(",", y.TextureDict.Textures.data_items.Select(t => t.Name))})");
                }
                else if (ext == ".ytyp")
                {
                    var d = Raw(f, out var e);
                    var y = new YtypFile(e); y.Load(d, e);
                    Console.WriteLine($"  {Path.GetFileName(f)}: {y.AllArchetypes?.Length ?? 0} arketip");
                }
            }
            catch (Exception ex)
            {
                bad++;
                Console.WriteLine($"  ! {Path.GetFileName(f)}: {ex.Message}");
            }
        }
        Console.WriteLine(bad == 0 ? $"doğrulama tamam ({ydrs} ydr)" : $"{bad} dosya hatalı");
        return bad == 0 ? 0 : 3;
    }
}
