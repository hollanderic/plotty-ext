#!/usr/bin/env python3
import sys
import os
import time
import json

# Append the directory containing plotty.py to path
sys.path.append(os.path.abspath("d:/src/personal/plotty"))

try:
    import plotty
except ImportError as e:
    print(f"ERROR: Could not import plotty.py from d:/src/personal/plotty. {e}", flush=True)
    sys.exit(1)

def main():
    try:
        args = plotty.parse_arguments()
    except Exception as e:
        print(f"ERROR: Argument parsing failed. {e}", flush=True)
        sys.exit(1)
    
    source_handler = plotty.get_source_handler(args.source, args.follow, args.baud)
    if not source_handler:
        print(f"ERROR: Could not determine source type for '{args.source}'", flush=True)
        sys.exit(1)
        
    print("STATUS: Connecting", flush=True)
    try:
        first_line = source_handler.connect()
    except Exception as e:
        print(f"ERROR: Connection failed: {e}", flush=True)
        sys.exit(1)
        
    print("STATUS: Connected", flush=True)
    
    # Handle Header
    labels = [f"Col {c}" for c in args.columns[1:]]
    if args.title and first_line:
        parts = first_line.split(',')
        new_labels = []
        try:
            for c in args.columns[1:]:
                if c < len(parts):
                    new_labels.append(parts[c].strip())
                else:
                    new_labels.append(f"Col {c}")
            labels = new_labels
        except Exception as e:
            pass
        
        if isinstance(source_handler, plotty.HttpSource):
            source_handler.first_line_consumed = True
        elif isinstance(source_handler, plotty.LocalFileSource):
            source_handler.file_handle.readline() # Consume it
            
    elif first_line:
        if isinstance(source_handler, (plotty.SshSource, plotty.SocketSource)):
            source_handler.queue.put(first_line)
        elif isinstance(source_handler, plotty.HttpSource):
            source_handler.first_line_consumed = False
            
    x_label = f"Column {args.columns[0]}"
    if args.title and first_line:
        parts = first_line.split(',')
        if args.columns[0] < len(parts):
            x_label = parts[args.columns[0]].strip()
            
    metadata = {
        "labels": labels,
        "x_label": x_label
    }
    print(f"METADATA:{json.dumps(metadata)}", flush=True)
    
    source_handler.start()
    
    try:
        while source_handler.running:
            new_lines = source_handler.get_data()
            for line in new_lines:
                val = plotty.parse_line(line, args.columns)
                if val:
                    print(f"DATA:{json.dumps(val)}", flush=True)
            
            if not args.follow and not source_handler.thread.is_alive() and source_handler.queue.empty():
                break
                
            time.sleep(0.05)
            
    except KeyboardInterrupt:
        pass
    except Exception as e:
        print(f"ERROR: Runtime error: {e}", flush=True)
    finally:
        source_handler.stop()
        print("STATUS: Disconnected", flush=True)

if __name__ == "__main__":
    main()
