Ext.define("CumulativeFlowCalculator", {
     extend: "Rally.data.lookback.calculator.TimeSeriesCalculator",
     config: {
         stateFieldName: 'ScheduleState',
         stateFieldValues: ['Defined', 'In-Progress', 'Completed', 'Accepted', 'Finished'],
         lowestLevelPortfolioItemType: '',
         portfolioItemStateDone: '',
         portfolioItemStateName: '',
         preliminaryEstimateMap: []
     },
     InProgressName: 'In-Progress',
     AcceptedName: 'Accepted',
     actualPoints: 0,
     actualIndex: 0,
     totalPoints: 0,
     gridStoreData: null,
     
     constructor: function(config) {
         this.initConfig(config);
         this.callParent(arguments);
     },
     runCalculation: function (snapshots) {
         var calculatorConfig = this._prepareCalculatorConfig(),
             seriesConfig = this._buildSeriesConfig(calculatorConfig);

         var calculator = this.prepareCalculator(calculatorConfig);
         calculator.addSnapshots(snapshots, this._getStartDate(snapshots), this._getEndDate(snapshots));
         
         this.gridStoreData = this._buildGridStore(snapshots);
         
         var calcs = this._transformLumenizeDataToHighchartsSeries(calculator, seriesConfig);

         var total_series = this.getSeriesByName('TotalEstimated',calcs);
         this.totalPoints = total_series.data[calcs.categories.length-1];
         total_series.stack = 'total';
         total_series.zIndex = 0;
         total_series.color = '#CCCCCC';                 

         
         var actual_series = this._getActualSeries(calcs);
         calcs.series.push(actual_series);
        
         var ideal_series = this._getIdealSeries(calcs);
         calcs.series.push(ideal_series);
         
         var remaining_series = this._getRemainingSeries(calcs);
         if (remaining_series){
             calcs.series.push(remaining_series);
         }
         
         //Format the categories by week 
         var new_categories = _.map(calcs.categories, function(c){
             var week = Rally.util.DateTime.format(new Date(c), 'W');
             var year = Rally.util.DateTime.format(new Date(c),'Y');
             return 'WW' + week.toString(); 
         });
         calcs.categories = new_categories;
         
         var remove_series = ['DerivedLeafStoryPlanEstimateTotal','DerivedPreliminaryEstimate','PlanEstimate'];
         for (var i = calcs.series.length-1; i >= 0; i--){
             if (calcs.series[i].name != 'TotalEstimated'){
                 calcs.series[i].zIndex = 1; 
             } 
             if (Ext.Array.contains(remove_series,calcs.series[i].name)){
                 calcs.series.splice(i,1);
             }
         }
        // console.log('calcs',calcs);
         return calcs;
     },
     getPercentCompleted: function(){
         if (this.totalPoints > 0){
             return Ext.String.format("{0} % of {1} total points completed", (this.actualPoints / this.totalPoints * 100).toFixed(1), this.totalPoints);
         }
         return 'No total points to calculate % Completed';
     },
     _getRemainingSeries: function(calcs){

         var velocity = 0;
         var actual_index = Number(this.actualIndex);
         if (actual_index == 0 && actual_index == 0 ||
                 actual_index == calcs.categories.length-1){
             return null; 
         }
         var data = [];
         for (var i=0; i< calcs.categories.length; i++){
             data[i] = null;
        }
         
        data[actual_index] = this.actualPoints;
        data[calcs.categories.length-1] = this.totalPoints;
        var delta_points = data[calcs.categories.length-1] - data[actual_index];

        //calculate velocity and slope of the line
        var endDate = Rally.util.DateTime.fromIsoString(calcs.categories[calcs.categories.length-1]);
        var startDate = Rally.util.DateTime.fromIsoString(calcs.categories[actual_index]);
        var delta_days = calcs.categories.length-1 - actual_index;   //Rally.util.DateTime.getDifference(new Date(endDate),new Date(startDate),'day');
        var delta_weeks = Rally.util.DateTime.getDifference(endDate,startDate, 'week');

        var slope = delta_points/delta_days;  
        var velocity = Math.round(delta_points/delta_weeks);

        if (slope == 0){
            return null; 
        }
        
        var points = [];
        for (var i = actual_index; i > 0; i--){
            y = this.actualPoints - slope*(actual_index - i);
            if (y > 0){
                points.push({x: i, y: y});
            }
        }
        if (points.length == 0){
            return null; 
        }
        
        var slope_index = Math.round(points.length * .33);
        data[points[slope_index].x] = points[slope_index].y;
        
         var series = {
                 name: Ext.String.format('Remaining (velocity: {0})',velocity),
                 type: 'line',
                 data: data,
                 color: '#00CCFF',
                 dashStyle: 'Solid',
                 stack: 'remaining'
         };
         return series;
     },
     _getIdealSeries: function(calcs){
         var data = [];
         var endDate = new Date(this.getEndDate());
         var startDate = new Date(this.getStartDate());
         var totalPoints = Number(this.totalPoints);
         var num_velocity_periods = Rally.util.DateTime.getDifference(endDate, startDate,'week')/2;
         var velocity = 0;
         var data = [];
         var startDatei = 0;

         var endDatei = calcs.categories.length-1;  
         
         for(var i=0; i< calcs.categories.length; i++){
            var d = new Date(calcs.categories[i]);
            data[i] = null; 
            if (d.getYear() == startDate.getYear() && 
                 d.getMonth() == startDate.getMonth() && 
                 d.getDate() == startDate.getDate()){
                startDatei = i;
            }
            if (d.getYear() == endDate.getYear() && 
                    d.getMonth() == endDate.getMonth() && 
                    d.getDate() == endDate.getDate()){
                endDatei = i;   
               }
         };
         velocity = Math.round(totalPoints/num_velocity_periods);  
         data[startDatei] = 0;
         data[endDatei] = totalPoints;
         var series = {
                 name: Ext.String.format('Ideal (velocity: {0})',velocity),
                 type: 'line',
                 data: data,
                 color: '#00FF00',
                 dashStyle: 'Solid',
                 stack: 'ideal'
         };
         return series;
     },
     _getActualSeries: function(calcs){

         var data = []; 
         var num_velocity_periods = Rally.util.DateTime.getDifference(new Date(calcs.categories[calcs.categories.length-1]), new Date(calcs.categories[0]),'week')/2;
         var velocity = 0;
         var states = this.getStateFieldValues(); 

         this.actualPoints = 0 ;
         this.actualIndex = 0; 
         var currentDate = new Date();

         for(var i=0; i< calcs.categories.length; i++){
             var d = new Date(calcs.categories[i]);
             data[i] = null; 

             if (d.getYear() >= currentDate.getYear() && 
                  d.getMonth() >= currentDate.getMonth() && 
                  d.getDate() >= currentDate.getDate()){
                 this.actualIndex = i;
                 break; 
             }
          };

          if (this.actualIndex == 0){
              this.actualIndex = calcs.categories.length-1;
          }

         var in_progress_idx = Ext.Array.indexOf(states, this.InProgressName, 0); 
         var firstInProgressi = calcs.categories.length + 1;
         Ext.each(calcs.series, function(s){
             var current_state_idx = Ext.Array.indexOf(states, s.name, 0);
             if (current_state_idx >= in_progress_idx){
                 for (var i=0; i<s.data.length; i++){
                     if (s.data[i] > 0 && i < firstInProgressi){
                         firstInProgressi = i;
                         i = s.data.length; 
                     }
                 }
             }
             
             if (s.name == this.AcceptedName){
//                 _.range(s.data.length).map(function () { return null });
                 for (var i=0; i<s.data.length; i++){
                     data[i] = null;
                 }
                 this.actualPoints = s.data[this.actualIndex];
             }
         }, this);
         
         data[firstInProgressi] = 0;
         data[this.actualIndex] = this.actualPoints; 
         velocity = Math.round(this.actualPoints/num_velocity_periods);  
         
         var series = {
                 name: Ext.String.format('Actual (velocity: {0})',velocity),
                 type: 'line',
                 data: data,
                 color: '#000000',
                 dashStyle: 'Solid',
                 stack: 'actual'
         };
         return series;
     },
     getMetrics: function() {
         var metrics = [];
         Ext.each(this.getStateFieldValues(), function(stateFieldValue){
             metrics.push({
                 field: 'PlanEstimate',
                 as: stateFieldValue,
                 f: 'filteredSum',
                 filterField: this.getStateFieldName(),
                 filterValues: [stateFieldValue],
                 display: 'area',
             });  
         }, this);
         
         metrics.push({
             field: 'DerivedLeafStoryPlanEstimateTotal',
             as: 'DerivedLeafStoryPlanEstimateTotal',
             f: 'sum',
         });

         metrics.push({
             field: 'DerivedPreliminaryEstimate',
             as: 'DerivedPreliminaryEstimate',
             f: 'sum',
         });

         metrics.push({
             field: 'PlanEstimate',
             as: 'PlanEstimate',
             f: 'sum'
         });

         return metrics; 
         
     },
       getDerivedFieldsOnInput: function(){
           return [{
               f: this.getDerivedPreliminaryEstimate,
               as: 'DerivedPreliminaryEstimate',
               preliminaryEstimateMap: this.preliminaryEstimateMap
            },{
                f: this.getDerivedLeafStoryPlanEstimateTotal,
                as: 'DerivedLeafStoryPlanEstimateTotal'
             }];
    },
    getDerivedLeafStoryPlanEstimateTotal: function(snapshot){
        if (snapshot.LeafStoryPlanEstimateTotal){
            return Number(snapshot.LeafStoryPlanEstimateTotal);
        }
        return 0; 
    },
     getDerivedFieldsAfterSummary: function(){
         return [{
             f: this.getTotalEstimated,
             as: 'TotalEstimated',
             display: 'area',
             color: 'gray',
          }];
     },
     getDerivedPreliminaryEstimate: function(snapshot){
         if (snapshot.PreliminaryEstimate){
             return Number(this.preliminaryEstimateMap[snapshot.PreliminaryEstimate]);
         }
         return 0;
     },
     getTotalEstimated: function(snapshot,index,metrics,seriesData){
         return Ext.Array.max([seriesData[index].DerivedPreliminaryEstimate,seriesData[index].DerivedLeafStoryPlanEstimateTotal,seriesData[index].PlanEstimate]);
     },
     calcTotalPoints: function(calcs){
         Ext.each(calcs.series, function(s){
             if (s.name == 'TotalEstimated'){
                 return Number(s.data[calcs.categories.length-1]);
             }
         },this);
     },
     getSeriesByName: function(seriesName, calcs){
         var series = null; 
         Ext.each(calcs.series, function(s){
             var re = new RegExp(seriesName,"i");
             if (re.test(s.name)){
                 series = s;  
             }
         });
         return series; 
     },
     _buildGridStore: function(snapshots){
         var data = [];
         var columnConfigs = [
             {text: 'FormattedID', dataIndex: 'ObjectID', renderer: function(v,m,r){
                 return r.get('FormattedID');
             }},
             {text: 'Name', dataIndex: 'Name', flex: 1},
//             {text: 'PreliminaryEstimate', dataIndex: 'PreliminaryEstimate'},
             {text: 'PlanEstimate', dataIndex: 'PlanEstimate'},
             {text: 'State/ScheduleState', dataIndex: 'ScheduleState'},
//             {text: 'PortfolioItem', dataIndex: 'PortfolioItem'},
//             {text: 'State', dataIndex: 'State'},
//             {text: 'PreliminaryEstimate', dataIndex: 'PreliminaryEstimate'},
//             {text: 'LeafStoryPlanEstimateTotal', dataIndex: 'LeafStoryPlanEstimateTotal'},
//             {text: 'PortfolioItemFormattedID', dataIndex: 'PortfolioItem'},
//             {text: 'AcceptedLeafStoryPlanEstimateTotal', dataIndex: 'AcceptedLeafStoryPlanEstimateTotal'}
         ]; 
         
         var data_hash = {};  
         Ext.each(snapshots, function(snap){
             if (/^9999/.test(snap._ValidTo)){
                   var obj_id = snap.ObjectID
                   var rec = { 
                             "ObjectID": snap.ObjectID,
                             "FormattedID":snap.FormattedID,
                             "Name": snap.Name,
                             "PlanEstimate": '',
                             "parent": '',
                             "State": '',
                             "PreliminaryEstimate": ''
                   };
                     if (snap.PlanEstimate){
                         rec['PlanEstimate'] = snap.PlanEstimate;
                     }
                     if (snap.LeafStoryPlanEstimateTotal){
                         rec['PlanEstimate'] = Ext.String.format("{0} ({1})",snap.LeafStoryPlanEstimateTotal, Number(snap.AcceptedLeafStoryPlanEstimateTotal));
                     }
                     if (snap.PortfolioItem){
                         rec['parent'] = snap.PortfolioItem; 
                     }
                     if (snap.State){
                         rec['State'] = snap.State;
                     }
                     if (snap.ScheduleState){
                         rec['State'] = snap.ScheduleState;
                     }
                    if (snap.PreliminaryEstimate){
                         rec['PreliminaryEstimate'] = this.preliminaryEstimateMap[snap.PreliminaryEstimate];
                     }
                     data_hash[obj_id] = rec;
             }
         },this);
         return {data: data_hash, columnCfgs: columnConfigs}; 
     }
 });