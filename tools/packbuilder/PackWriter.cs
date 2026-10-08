using CodeWalker.GameFiles;
using SharpDX;
using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Xml;

namespace LoeVdPack;

// Paket resource'unu yazar: ydr (her parça x her slot), ytd (slot dokuları), ytyp (arketipler), surface json, şablon png.
static class PackWriter
{
    public const string FlatNormal = "loe_vd_flat_n";
    public const string SpecMap = "loe_vd_spec";

    static string F(float v) => v.ToString("0.#######", CultureInfo.InvariantCulture);
    static string F(double v) => v.ToString("0.#######", CultureInfo.InvariantCulture);

    public static string Sanitize(string s)
    {
        var sb = new StringBuilder();
        foreach (var ch in (s ?? "").ToLowerInvariant()) sb.Append(char.IsLetterOrDigit(ch) ? ch : '_');
        return sb.ToString();
    }

    // ------------------------------------------------------------------ YDR
    static void Geometry(StringBuilder x, List<ShellVertex> verts, List<int> idx)
    {
        var mn = new Vector3(float.MaxValue); var mx = new Vector3(float.MinValue);
        foreach (var v in verts) { mn = Vector3.Min(mn, v.P); mx = Vector3.Max(mx, v.P); }
        x.Append("    <Item>\n     <ShaderIndex value=\"0\" />\n");
        x.Append($"     <BoundingBoxMin x=\"{F(mn.X)}\" y=\"{F(mn.Y)}\" z=\"{F(mn.Z)}\" w=\"{F(mn.X)}\" />\n");
        x.Append($"     <BoundingBoxMax x=\"{F(mx.X)}\" y=\"{F(mx.Y)}\" z=\"{F(mx.Z)}\" w=\"{F(mx.X)}\" />\n");
        x.Append("     <VertexBuffer>\n      <Flags value=\"0\" />\n      <Layout type=\"GTAV1\">\n       <Position />\n       <Normal />\n       <Colour0 />\n       <TexCoord0 />\n       <Tangent />\n      </Layout>\n      <Data>\n");
        foreach (var v in verts)
        {
            x.Append("       ").Append(F(v.P.X)).Append(' ').Append(F(v.P.Y)).Append(' ').Append(F(v.P.Z)).Append("   ")
             .Append(F(v.N.X)).Append(' ').Append(F(v.N.Y)).Append(' ').Append(F(v.N.Z)).Append("   255 0 0 255   ")
             .Append(F(v.UV.X)).Append(' ').Append(F(v.UV.Y)).Append("   ")
             .Append(F(v.T.X)).Append(' ').Append(F(v.T.Y)).Append(' ').Append(F(v.T.Z)).Append(' ').Append(F(v.T.W)).Append('\n');
        }
        x.Append("      </Data>\n     </VertexBuffer>\n     <IndexBuffer>\n      <Data>\n");
        for (int i = 0; i < idx.Count; i += 24)
        {
            x.Append("       ");
            for (int j = i; j < Math.Min(i + 24, idx.Count); j++) x.Append(idx[j]).Append(' ');
            x.Append('\n');
        }
        x.Append("      </Data>\n     </IndexBuffer>\n    </Item>\n");
    }

    // 65535 köşe sınırı için parçayı geometrilere böl
    static List<(List<ShellVertex>, List<int>)> Split(ShellPart p, int maxV = 60000)
    {
        var outp = new List<(List<ShellVertex>, List<int>)>();
        if (p.V.Count <= maxV) { outp.Add((p.V, p.I)); return outp; }
        var cv = new List<ShellVertex>(); var ci = new List<int>(); var map = new Dictionary<int, int>();
        for (int t = 0; t + 2 < p.I.Count; t += 3)
        {
            if (cv.Count + 3 > maxV) { outp.Add((cv, ci)); cv = new(); ci = new(); map = new(); }
            for (int k = 0; k < 3; k++)
            {
                int o = p.I[t + k];
                if (!map.TryGetValue(o, out int n)) { n = cv.Count; cv.Add(p.V[o]); map[o] = n; }
                ci.Add(n);
            }
        }
        if (ci.Count > 0) outp.Add((cv, ci));
        return outp;
    }

    public static string YdrXml(string name, ShellPart p, string diffuse, float lodDist)
    {
        var c = (p.Min + p.Max) / 2f;
        float r = (p.Max - p.Min).Length() / 2f;
        var x = new StringBuilder(1 << 20);
        x.Append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<Drawable>\n");
        x.Append($" <Name>{name}</Name>\n");
        x.Append($" <BoundingSphereCenter x=\"{F(c.X)}\" y=\"{F(c.Y)}\" z=\"{F(c.Z)}\" />\n <BoundingSphereRadius value=\"{F(r)}\" />\n");
        x.Append($" <BoundingBoxMin x=\"{F(p.Min.X)}\" y=\"{F(p.Min.Y)}\" z=\"{F(p.Min.Z)}\" />\n <BoundingBoxMax x=\"{F(p.Max.X)}\" y=\"{F(p.Max.Y)}\" z=\"{F(p.Max.Z)}\" />\n");
        x.Append($" <LodDistHigh value=\"{F(lodDist)}\" />\n <LodDistMed value=\"9998\" />\n <LodDistLow value=\"9998\" />\n <LodDistVlow value=\"9998\" />\n");
        x.Append(" <FlagsHigh value=\"4\" />\n <FlagsMed value=\"0\" />\n <FlagsLow value=\"0\" />\n <FlagsVlow value=\"0\" />\n");
        x.Append(" <ShaderGroup>\n  <Shaders>\n   <Item>\n    <Name>normal_spec_decal</Name>\n    <FileName>normal_spec_decal.sps</FileName>\n    <RenderBucket value=\"2\" />\n    <Parameters>\n");
        x.Append($"     <Item name=\"DiffuseSampler\" type=\"Texture\">\n      <Name>{diffuse}</Name>\n     </Item>\n");
        x.Append($"     <Item name=\"BumpSampler\" type=\"Texture\">\n      <Name>{FlatNormal}</Name>\n     </Item>\n");
        x.Append($"     <Item name=\"SpecSampler\" type=\"Texture\">\n      <Name>{SpecMap}</Name>\n     </Item>\n");
        x.Append("     <Item name=\"useTessellation\" type=\"Vector\" x=\"0\" y=\"0\" z=\"0\" w=\"0\" />\n");
        x.Append("     <Item name=\"wetnessMultiplier\" type=\"Vector\" x=\"1\" y=\"0\" z=\"0\" w=\"0\" />\n");
        x.Append("     <Item name=\"bumpiness\" type=\"Vector\" x=\"0\" y=\"0\" z=\"0\" w=\"0\" />\n");
        x.Append("     <Item name=\"specMapIntMask\" type=\"Vector\" x=\"1\" y=\"1\" z=\"1\" w=\"0\" />\n");
        x.Append("     <Item name=\"specularIntensityMult\" type=\"Vector\" x=\"0.8\" y=\"0\" z=\"0\" w=\"0\" />\n");
        x.Append("     <Item name=\"specularFalloffMult\" type=\"Vector\" x=\"220\" y=\"0\" z=\"0\" w=\"0\" />\n");
        x.Append("     <Item name=\"specularFresnel\" type=\"Vector\" x=\"0.96\" y=\"0\" z=\"0\" w=\"0\" />\n");
        x.Append("     <Item name=\"globalAnimUV1\" type=\"Vector\" x=\"0\" y=\"1\" z=\"0\" w=\"0\" />\n");
        x.Append("     <Item name=\"globalAnimUV0\" type=\"Vector\" x=\"1\" y=\"0\" z=\"0\" w=\"0\" />\n");
        x.Append("    </Parameters>\n   </Item>\n  </Shaders>\n </ShaderGroup>\n");
        x.Append(" <DrawableModelsHigh>\n  <Item>\n   <RenderMask value=\"255\" />\n   <Flags value=\"0\" />\n   <HasSkin value=\"0\" />\n   <BoneIndex value=\"0\" />\n   <Unknown1 value=\"0\" />\n   <Geometries>\n");
        foreach (var (v, i) in Split(p)) Geometry(x, v, i);
        x.Append("   </Geometries>\n  </Item>\n </DrawableModelsHigh>\n <Lights />\n</Drawable>\n");
        return x.ToString();
    }

    public static byte[] Ydr(string xml)
    {
        var doc = new XmlDocument();
        doc.LoadXml(xml);
        var data = XmlMeta.GetData(doc, MetaFormat.Ydr, "");
        if (data == null || data.Length == 0) throw new Exception("ydr dönüştürülemedi");
        return Gen9(data, ".ydr");
    }

    // FiveM for GTAV Enhanced: stream_enhanced klasörü gen9 biçimi ister (ydr = 159, ytd = 5).
    // XML'den gen8 üretilir, CodeWalker'ın kendi dönüştürücüsüyle gen9'a çevrilir.
    public static byte[] Gen9(byte[] gen8, string ext)
    {
        var prev = RpfManager.IsGen9;
        RpfManager.IsGen9 = true;
        try
        {
            var data = CodeWalker.Core.Utils.Gen9Converter.TryConvert(gen8, ext, false);
            if (data == null || data.Length == 0) throw new Exception(ext + " gen9'a dönüştürülemedi");
            return data;
        }
        finally { RpfManager.IsGen9 = prev; }
    }

    // ------------------------------------------------------------------ YTD
    static byte[] Dds(int w, int h, byte b, byte g, byte r, byte a)
    {
        var ms = new MemoryStream();
        var bw = new BinaryWriter(ms);
        bw.Write(0x20534444u);           // "DDS "
        bw.Write(124u);
        bw.Write(0x100Fu);               // CAPS|HEIGHT|WIDTH|PITCH|PIXELFORMAT
        bw.Write((uint)h); bw.Write((uint)w); bw.Write((uint)(w * 4)); bw.Write(0u); bw.Write(1u);
        for (int i = 0; i < 11; i++) bw.Write(0u);
        bw.Write(32u); bw.Write(0x41u); bw.Write(0u); bw.Write(32u);
        bw.Write(0x00FF0000u); bw.Write(0x0000FF00u); bw.Write(0x000000FFu); bw.Write(0xFF000000u);
        bw.Write(0x1000u); bw.Write(0u); bw.Write(0u); bw.Write(0u); bw.Write(0u);
        for (int i = 0; i < w * h; i++) { bw.Write(b); bw.Write(g); bw.Write(r); bw.Write(a); }
        return ms.ToArray();
    }

    public static byte[] Ytd(IEnumerable<(string name, byte b, byte g, byte r, byte a, string usage)> textures, string tmpDir)
    {
        Directory.CreateDirectory(tmpDir);
        var x = new StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<TextureDictionary>\n");
        foreach (var t in textures)
        {
            File.WriteAllBytes(Path.Combine(tmpDir, t.name + ".dds"), Dds(8, 8, t.b, t.g, t.r, t.a));
            x.Append($" <Item>\n  <Name>{t.name}</Name>\n  <Unk32 value=\"128\" />\n  <Usage>{t.usage}</Usage>\n  <UsageFlags>UNK24</UsageFlags>\n  <ExtraFlags value=\"0\" />\n");
            x.Append("  <Width value=\"8\" />\n  <Height value=\"8\" />\n  <MipLevels value=\"1\" />\n  <Format>D3DFMT_A8R8G8B8</Format>\n");
            x.Append($"  <FileName>{t.name}.dds</FileName>\n </Item>\n");
        }
        x.Append("</TextureDictionary>\n");
        var doc = new XmlDocument();
        doc.LoadXml(x.ToString());
        var data = XmlMeta.GetData(doc, MetaFormat.Ytd, tmpDir);
        if (data == null || data.Length == 0) throw new Exception("ytd dönüştürülemedi");
        return Gen9(data, ".ytd");
    }

    // ------------------------------------------------------------------ YTYP
    public static byte[] Ytyp(string name, IEnumerable<(string name, string txd, Vector3 min, Vector3 max, float lod)> archs)
    {
        var y = new YtypFile();
        y.NameHash = JenkHash.GenHash(name);
        JenkIndex.Ensure(name);
        foreach (var a in archs)
        {
            JenkIndex.Ensure(a.name);
            JenkIndex.Ensure(a.txd);
            var arch = y.AddArchetype();
            var def = arch._BaseArchetypeDef;
            def.lodDist = a.lod;
            def.flags = 8192;                 // gölge düşürme
            def.specialAttribute = 0;
            def.bbMin = a.min;
            def.bbMax = a.max;
            def.bsCentre = (a.min + a.max) / 2f;
            def.bsRadius = (a.max - a.min).Length() / 2f;
            def.hdTextureDist = 5f;
            def.name = JenkHash.GenHash(a.name);
            def.textureDictionary = JenkHash.GenHash(a.txd);
            def.clipDictionary = 0;
            def.drawableDictionary = 0;
            def.physicsDictionary = 0;
            def.assetType = rage__fwArchetypeDef__eAssetType.ASSET_TYPE_DRAWABLE;
            def.assetName = JenkHash.GenHash(a.name);
            arch._BaseArchetypeDef = def;
        }
        return y.Save();
    }

    // ------------------------------------------------------------------ PNG
    static readonly uint[] crcTable = Enumerable.Range(0, 256).Select(n =>
    {
        uint c = (uint)n;
        for (int k = 0; k < 8; k++) c = (c & 1) != 0 ? 0xEDB88320u ^ (c >> 1) : c >> 1;
        return c;
    }).ToArray();

    static uint Crc(byte[] d, int o, int l, uint c = 0xFFFFFFFFu)
    {
        for (int i = o; i < o + l; i++) c = crcTable[(c ^ d[i]) & 0xFF] ^ (c >> 8);
        return c;
    }

    public static byte[] Png(int w, int h, byte[] rgba)
    {
        var ms = new MemoryStream();
        void Chunk(string type, byte[] data)
        {
            var be = BitConverter.GetBytes(data.Length); Array.Reverse(be); ms.Write(be);
            var td = Encoding.ASCII.GetBytes(type).Concat(data).ToArray();
            ms.Write(td);
            var crc = BitConverter.GetBytes(Crc(td, 0, td.Length) ^ 0xFFFFFFFFu); Array.Reverse(crc); ms.Write(crc);
        }
        ms.Write(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 });
        var ihdr = new byte[13];
        var bw = BitConverter.GetBytes(w); Array.Reverse(bw); Array.Copy(bw, 0, ihdr, 0, 4);
        var bh = BitConverter.GetBytes(h); Array.Reverse(bh); Array.Copy(bh, 0, ihdr, 4, 4);
        ihdr[8] = 8; ihdr[9] = 6;
        Chunk("IHDR", ihdr);
        var raw = new byte[h * (w * 4 + 1)];
        for (int yy = 0; yy < h; yy++) Array.Copy(rgba, yy * w * 4, raw, yy * (w * 4 + 1) + 1, w * 4);
        var zs = new MemoryStream();
        using (var z = new System.IO.Compression.ZLibStream(zs, System.IO.Compression.CompressionLevel.Optimal, true)) z.Write(raw);
        Chunk("IDAT", zs.ToArray());
        Chunk("IEND", Array.Empty<byte>());
        return ms.ToArray();
    }

    // Tuval UV yerleşiminin şablonu (2B düzenleyicide arka plan)
    public static byte[] Template(ShellResult r, int px)
    {
        var img = new byte[px * px * 4];
        foreach (var t in r.UvTris)
        {
            Raster.FillUvTri(img, px, t.ua, t.ub, t.uc, 255, 255, 255, 46);
        }
        return Png(px, px, img);
    }

    // ------------------------------------------------------------------ PAKET
    public static void WriteManifest(string dir, string pack, IEnumerable<string> models)
    {
        var sb = new StringBuilder();
        sb.Append("fx_version 'cerulean'\ngame 'gta5'\nlua54 'yes'\n\n");
        sb.Append($"name '{pack}'\nauthor 'Legends of Empire'\ndescription 'loe_vehicledesigner yüzey paketi (tools/packbuilder ile üretildi)'\nversion '1.0.0'\n\n");
        sb.Append("loe_vd_pack 'yes'\n");
        foreach (var m in models) sb.Append($"loe_vd_surface 'surfaces/{m}.json'\n");
        // Enhanced: gen9 dosyaları stream_enhanced klasöründe; ytyp'yi this_is_a_map kendisi kaydeder (loe_pillbox_mlo ile aynı yol)
        sb.Append("\nfiles {\n    'surfaces/*.json',\n    'surfaces/*.png',\n}\n\nthis_is_a_map 'yes'\n");
        File.WriteAllText(Path.Combine(dir, "fxmanifest.lua"), sb.ToString(), new UTF8Encoding(false));
    }

    public static string SurfaceJson(string model, int size, int slots, ShellResult r, Vector3 mn, Vector3 mx)
    {
        var obj = new
        {
            model,
            size,
            slots,
            txd = "loe_vd_" + model,
            tex = "loe_vd_" + model + "_s%d",
            template = "surfaces/" + model + ".png",
            parts = r.Parts.Select(p => new { bone = p.Bone, prop = $"loe_vd_{model}_{Sanitize(p.Bone)}_s%d" }).ToArray(),
            bbox = new { min = new[] { mn.X, mn.Y, mn.Z }, max = new[] { mx.X, mx.Y, mx.Z } },
            charts = r.Charts.Select(c => c.ToJson()).ToArray(),
            stats = new { paintTris = r.PaintTris, keptTris = r.KeptTris, verts = r.Parts.Sum(p => p.V.Count) },
        };
        return JsonSerializer.Serialize(obj, new JsonSerializerOptions { WriteIndented = true });
    }
}
